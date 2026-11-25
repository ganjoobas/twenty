import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { Repository } from 'typeorm';

import { SignInUpService } from 'src/engine/core-modules/auth/services/sign-in-up.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { fromUserEntityToFlat } from 'src/engine/core-modules/user/utils/from-user-entity-to-flat.util';
import { WorkspaceService } from 'src/engine/core-modules/workspace/services/workspace.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { type WschatBridgeCreateWorkspaceInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-create-workspace.input';
import { type WschatBridgeCreatedWorkspaceDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-workspace.dto';
import { WschatBridgeMemberSettingsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-settings.service';
import { WschatBridgeOnboardingService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-onboarding.service';
import { WschatBridgeSubdomainService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-subdomain.service';
import { WschatBridgeUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-user.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { WschatBridgeWorkspaceSettingsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-settings.service';
import { mapUpstreamErrorToBridgeError } from 'src/engine/core-modules/wschat-bridge/utils/map-upstream-error-to-bridge-error.util';
import { maskEmail } from 'src/engine/core-modules/wschat-bridge/utils/mask-email.util';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Known refusals keep their own code; anything else is reported as a rolled-back creation, not a bare 500
const toCreationFailure = (error: unknown) =>
  error instanceof HttpException || mapUpstreamErrorToBridgeError(error) !== null
    ? error
    : wschatBridgeHttpException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        WSCHAT_BRIDGE_ERROR_CODES.WORKSPACE_CREATION_FAILED,
        'Workspace creation failed and was rolled back',
      );

@Injectable()
// oxlint-disable-next-line twenty/inject-workspace-repository
export class WschatBridgeWorkspaceCreationService {
  private readonly logger = new Logger(WschatBridgeWorkspaceCreationService.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly signInUpService: SignInUpService,
    private readonly workspaceService: WorkspaceService,
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly subdomainService: WschatBridgeSubdomainService,
    private readonly userService: WschatBridgeUserService,
    private readonly workspaceSettingsService: WschatBridgeWorkspaceSettingsService,
    private readonly memberSettingsService: WschatBridgeMemberSettingsService,
    private readonly onboardingService: WschatBridgeOnboardingService,
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
  ) {}

  async createWorkspace(
    input: WschatBridgeCreateWorkspaceInput,
  ): Promise<WschatBridgeCreatedWorkspaceDTO> {
    const displayName = input.displayName.trim();
    const subdomain = input.subdomain.trim();

    // Everything that can be refused is checked before the first write
    await this.assertMultiWorkspaceAllowedOrThrow();
    await this.subdomainService.assertUsableOrThrow(subdomain);

    const embeddingOrigins = isDefined(input.allowedEmbeddingOrigins)
      ? this.workspaceSettingsService.normalizeEmbeddingOriginsOrThrow(
          input.allowedEmbeddingOrigins,
        )
      : [];

    const { user } = await this.userService.findOrCreate(input.admin);

    const pendingWorkspace = await this.createPendingWorkspace({
      user,
      displayName,
      subdomain,
    });

    try {
      await this.activateAndConfigure({
        user,
        workspace: pendingWorkspace,
        input,
        embeddingOrigins,
      });
    } catch (error) {
      await this.removeHalfCreatedWorkspaceOrThrow(pendingWorkspace.id, error);

      throw toCreationFailure(error);
    }

    const workspace = await this.workspaceLookupService.findOrThrow(
      pendingWorkspace.id,
    );

    this.logger.log(
      `Workspace ${workspace.id}: created (subdomain ${workspace.subdomain}, status ${workspace.activationStatus}), admin ${maskEmail(user.email)}`,
    );

    return {
      workspaceId: workspace.id,
      subdomain: workspace.subdomain,
      url: this.workspaceLookupService.buildUrl(workspace),
    };
  }

  // Mirrors SignInUpService.isSignUpEnabled (a first workspace is always allowed) so the caller gets its own code
  private async assertMultiWorkspaceAllowedOrThrow(): Promise<void> {
    if (this.twentyConfigService.get('IS_MULTIWORKSPACE_ENABLED')) {
      return;
    }

    if ((await this.workspaceRepository.count()) === 0) {
      return;
    }

    throw wschatBridgeHttpException(
      HttpStatus.CONFLICT,
      WSCHAT_BRIDGE_ERROR_CODES.MULTIWORKSPACE_DISABLED,
      'This server does not allow creating another workspace (IS_MULTIWORKSPACE_ENABLED is off)',
    );
  }

  // Upstream's own creation (workspace row, custom application, membership, workspace-count limit, subdomain
  // uniqueness, billing customer when billing is on) in one core transaction. The user is passed as an existing
  // one, so shouldGrantServerAdmin is never consulted, and with canAccessFullAdminPanel set on an in-memory copy
  // only: that skips the IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS check, the bridge being the authority here.
  // signUpOnNewWorkspace reads existingUser for id/email/locale and never saves it, so the flag is not persisted.
  private async createPendingWorkspace({
    user,
    displayName,
    subdomain,
  }: {
    user: UserEntity;
    displayName: string;
    subdomain: string;
  }): Promise<WorkspaceEntity> {
    try {
      const { workspace } = await this.signInUpService.signUpOnNewWorkspace(
        {
          type: 'existingUser',
          existingUser: { ...user, canAccessFullAdminPanel: true },
        },
        { displayName, subdomain },
      );

      return workspace;
    } catch (error) {
      await this.removeWorkspaceLeftBySignUpOrThrow({
        userId: user.id,
        subdomain,
        error,
      });

      throw toCreationFailure(error);
    }
  }

  // The transaction rolls back on its own; only a failure after commit (billing customer creation) leaves a
  // PENDING_CREATION row. Its id is not returned on failure, so it is found by subdomain and creator membership.
  private async removeWorkspaceLeftBySignUpOrThrow({
    userId,
    subdomain,
    error,
  }: {
    userId: string;
    subdomain: string;
    error: unknown;
  }): Promise<void> {
    if (mapUpstreamErrorToBridgeError(error) !== null) {
      return;
    }

    const leftWorkspace = await this.workspaceRepository.findOne({
      where: {
        subdomain,
        activationStatus: WorkspaceActivationStatus.PENDING_CREATION,
      },
    });

    if (!isDefined(leftWorkspace)) {
      return;
    }

    const isOurs = isDefined(
      await this.userWorkspaceService.checkUserWorkspaceExists(
        userId,
        leftWorkspace.id,
      ),
    );

    if (isOurs) {
      await this.removeHalfCreatedWorkspaceOrThrow(leftWorkspace.id, error);
    }
  }

  private async activateAndConfigure({
    user,
    workspace,
    input,
    embeddingOrigins,
  }: {
    user: UserEntity;
    workspace: WorkspaceEntity;
    input: WschatBridgeCreateWorkspaceInput;
    embeddingOrigins: string[];
  }): Promise<void> {
    // Builds the schema, standard objects/views and roles, the admin's workspaceMember and Admin role, exactly as the
    // activateWorkspace mutation does; the real user (not the in-memory copy) is passed
    const activatedWorkspace = await this.workspaceService.activateWorkspace(
      fromUserEntityToFlat(user),
      workspace,
    );

    // Upstream sets CREATED when billing is on and there is no subscription; the onboarding cleaner deletes CREATED
    // workspaces after 7 days. WSChat bills its own clients, so a bridge workspace is always a live one
    if (
      activatedWorkspace?.activationStatus === WorkspaceActivationStatus.CREATED
    ) {
      await this.workspaceService.reactivateWorkspace(workspace.id);
    }

    const adminUserWorkspace =
      await this.userWorkspaceService.getUserWorkspaceForUserOrThrow({
        userId: user.id,
        workspaceId: workspace.id,
        relations: [],
      });

    await this.workspaceSettingsService.updateCoreFields({
      workspaceId: workspace.id,
      fields: { isPublicInviteLinkEnabled: false, isPasswordAuthEnabled: false },
    });

    if (embeddingOrigins.length > 0) {
      await this.workspaceSettingsService.setEmbeddingOrigins({
        workspaceId: workspace.id,
        origins: embeddingOrigins,
      });
    }

    await this.memberSettingsService.apply({
      workspaceId: workspace.id,
      userId: user.id,
      userWorkspaceId: adminUserWorkspace.id,
      profile: input.admin,
    });

    await this.userService.markEmailVerified(user);

    await this.onboardingService.completeAllSteps({
      userId: user.id,
      workspaceId: workspace.id,
    });
  }

  // Hard delete (the same path as the admin panel's workspace deletion): a soft-deleted row would keep holding the
  // subdomain. Upstream also soft-deletes the admin's core.user if this was their only workspace.
  private async removeHalfCreatedWorkspaceOrThrow(
    workspaceId: string,
    cause: unknown,
  ): Promise<void> {
    this.logger.error(
      `Workspace ${workspaceId}: creation failed, removing it: ${describeError(cause)}`,
    );

    try {
      await this.workspaceService.deleteWorkspace(workspaceId, false);
    } catch (cleanupError) {
      this.logger.error(
        `Workspace ${workspaceId}: cleanup after failed creation failed too: ${describeError(cleanupError)}`,
      );

      throw wschatBridgeHttpException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        WSCHAT_BRIDGE_ERROR_CODES.WORKSPACE_CREATION_FAILED,
        `Creation failed and workspace ${workspaceId} could not be removed; it still holds the subdomain`,
      );
    }

    this.logger.log(`Workspace ${workspaceId}: removed after failed creation`);
  }
}
