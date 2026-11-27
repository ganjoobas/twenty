import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
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
import { type WschatBridgeCreateWorkspaceResultDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-workspace.dto';
import { WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-managed-roles.constant';
import { WschatBridgeManagedRoleService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-managed-role.service';
import { WschatBridgeMemberUpsertService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-upsert.service';
import { WschatBridgeOnboardingService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-onboarding.service';
import { WschatBridgeSubdomainService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-subdomain.service';
import { type WschatBridgeLocale } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';
import { WschatBridgeSampleWorkflowsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-sample-workflows.service';
import { WschatBridgeSampleRecordsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-sample-records.service';
import { WschatBridgeStarterLayoutService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-starter-layout.service';
import { WschatBridgeDataModelService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-data-model.service';
import { WschatBridgeServiceUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-service-user.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { WschatBridgeWorkspaceSettingsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-settings.service';
import { mapUpstreamErrorToBridgeError } from 'src/engine/core-modules/wschat-bridge/utils/map-upstream-error-to-bridge-error.util';
import { maskEmail } from 'src/engine/core-modules/wschat-bridge/utils/mask-email.util';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Known refusals keep their own code; anything else is reported as a rolled-back creation, not a bare 500
const toCreationFailure = (error: unknown) =>
  error instanceof HttpException ||
  mapUpstreamErrorToBridgeError(error) !== null
    ? error
    : wschatBridgeHttpException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        WSCHAT_BRIDGE_ERROR_CODES.WORKSPACE_CREATION_FAILED,
        'Workspace creation failed and was rolled back',
      );

@Injectable()
// oxlint-disable-next-line twenty/inject-workspace-repository
export class WschatBridgeWorkspaceCreationService {
  private readonly logger = new Logger(
    WschatBridgeWorkspaceCreationService.name,
  );

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly signInUpService: SignInUpService,
    private readonly workspaceService: WorkspaceService,
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly subdomainService: WschatBridgeSubdomainService,
    private readonly serviceUserService: WschatBridgeServiceUserService,
    private readonly workspaceSettingsService: WschatBridgeWorkspaceSettingsService,
    private readonly managedRoleService: WschatBridgeManagedRoleService,
    private readonly memberUpsertService: WschatBridgeMemberUpsertService,
    private readonly onboardingService: WschatBridgeOnboardingService,
    private readonly dataModelService: WschatBridgeDataModelService,
    private readonly starterLayoutService: WschatBridgeStarterLayoutService,
    private readonly sampleRecordsService: WschatBridgeSampleRecordsService,
    private readonly sampleWorkflowsService: WschatBridgeSampleWorkflowsService,
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
  ) {}

  async createWorkspace(
    input: WschatBridgeCreateWorkspaceInput,
  ): Promise<WschatBridgeCreateWorkspaceResultDTO> {
    const displayName = input.displayName.trim();
    const subdomain = input.subdomain.trim();

    // Everything that can be refused is checked before the first write
    this.serviceUserService.assertNotServiceUserOrThrow(input.admin.email);
    await this.assertMultiWorkspaceAllowedOrThrow();
    await this.subdomainService.assertUsableOrThrow(subdomain);

    const embeddingOrigins = isDefined(input.allowedEmbeddingOrigins)
      ? this.workspaceSettingsService.normalizeEmbeddingOriginsOrThrow(
          input.allowedEmbeddingOrigins,
        )
      : [];

    // The service user creates the workspace, so it is the one that receives the standard Admin role
    const user = await this.serviceUserService.findOrCreate();

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

    await this.tryRemoveSampleRecords(workspace.id);
    await this.tryDeactivateSampleWorkflows(workspace.id);

    const dataModelReady = await this.tryEnsureDataModel(
      workspace.id,
      input.locale ?? 'en',
    );

    // Never throws; what failed is retried by enforce
    if (dataModelReady) {
      const starterLayout = await this.starterLayoutService.apply({
        workspaceId: workspace.id,
        locale: input.locale ?? 'en',
        actions: input.actions,
      });

      this.logger.log(
        `Workspace ${workspace.id}: starter layout at version ${starterLayout.starterLayoutVersion}, created ${starterLayout.starterLayoutCreated.join(', ') || 'nothing'}`,
      );
    }

    this.logger.log(
      `Workspace ${workspace.id}: created (subdomain ${workspace.subdomain}, status ${workspace.activationStatus}, data model ${dataModelReady ? 'ready' : 'pending'}), admin ${maskEmail(input.admin.email)}`,
    );

    return {
      workspaceId: workspace.id,
      subdomain: workspace.subdomain,
      url: this.workspaceLookupService.buildUrl(workspace),
      dataModelReady,
    };
  }

  // Not fatal: a usable workspace with upstream's samples beats no workspace; they can be removed by hand
  private async tryRemoveSampleRecords(workspaceId: string): Promise<void> {
    try {
      const removed =
        await this.sampleRecordsService.removeSampleRecords(workspaceId);

      this.logger.log(
        `Workspace ${workspaceId}: sample records removed ${JSON.stringify(removed)}`,
      );
    } catch (error) {
      this.logger.warn(
        `Workspace ${workspaceId}: sample records not removed: ${describeError(error)}`,
      );
    }
  }

  // Not fatal either: enforce switches them off later (starter layout version 3)
  private async tryDeactivateSampleWorkflows(
    workspaceId: string,
  ): Promise<void> {
    try {
      const { deactivated } =
        await this.sampleWorkflowsService.deactivateFactoryWorkflows(
          workspaceId,
        );

      this.logger.log(
        `Workspace ${workspaceId}: sample workflows switched off: ${deactivated.join(', ') || 'none'}`,
      );
    } catch (error) {
      this.logger.warn(
        `Workspace ${workspaceId}: sample workflows not switched off: ${describeError(error)}`,
      );
    }
  }

  // Outside the rollback on purpose: the workspace, its lockdown and its admin are complete and usable, so a data
  // model problem (a busy schema above all) must never delete it; enforce finishes the model later
  private async tryEnsureDataModel(
    workspaceId: string,
    locale: WschatBridgeLocale,
  ): Promise<boolean> {
    try {
      const { dataModelReady } = await this.dataModelService.ensure({
        workspaceId,
        locale,
      });

      return dataModelReady;
    } catch (error) {
      this.logger.warn(
        `Workspace ${workspaceId}: data model not finished at creation, enforce will finish it: ${describeError(error)}`,
      );

      return false;
    }
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
    // Builds the schema, standard objects/views and roles, the service user's workspaceMember and Admin role, exactly
    // as the activateWorkspace mutation does; the real user (not the in-memory copy) is passed
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

    await this.workspaceSettingsService.enforceOwnedSettings(workspace.id);

    if (embeddingOrigins.length > 0) {
      await this.workspaceSettingsService.setEmbeddingOrigins({
        workspaceId: workspace.id,
        origins: embeddingOrigins,
      });
    }

    await this.onboardingService.completeAllSteps({
      userId: user.id,
      workspaceId: workspace.id,
    });

    await this.managedRoleService.ensure({
      workspaceId: workspace.id,
      role: WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE,
      label: input.adminRoleLabel?.trim(),
    });

    // The company's own admin joins like any member WSChat adds later
    await this.memberUpsertService.upsertMember(workspace.id, {
      ...input.admin,
      role: 'admin',
    });
  }

  // Hard delete (the admin panel's path): a soft-deleted row would keep holding the subdomain. Upstream also
  // soft-deletes every member's core.user that has no other workspace, the service user included on the very
  // first creation; the next findOrCreate then makes a fresh row (the e-mail index ignores deleted rows).
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
