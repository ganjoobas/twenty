import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { AppPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { Repository } from 'typeorm';

import { LoginTokenService } from 'src/engine/core-modules/auth/token/services/login-token.service';
import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type WschatBridgeLoginLinkDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-login-link.dto';
import { type WschatBridgeLoginLinkInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-login-link.input';
import { WschatBridgeServiceUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-service-user.service';
import { maskEmail } from 'src/engine/core-modules/wschat-bridge/utils/mask-email.util';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

// Not provisioned yet: there may be no workspace schema or member row to land on
const NOT_READY_ACTIVATION_STATUSES: WorkspaceActivationStatus[] = [
  WorkspaceActivationStatus.PENDING_CREATION,
  WorkspaceActivationStatus.ONGOING_CREATION,
];

@Injectable()
export class WschatBridgeService {
  private readonly logger = new Logger(WschatBridgeService.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly loginTokenService: LoginTokenService,
    private readonly workspaceDomainsService: WorkspaceDomainsService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly serviceUserService: WschatBridgeServiceUserService,
  ) {}

  async createLoginLink(
    input: WschatBridgeLoginLinkInput,
  ): Promise<WschatBridgeLoginLinkDTO> {
    // Nobody may act in a workspace as the service user, the holder of the standard Admin role
    this.serviceUserService.assertNotServiceUserOrThrow(input.email);

    // Soft-deleted workspaces, users and memberships are excluded by TypeORM's @DeleteDateColumn
    const workspace = await this.workspaceRepository.findOne({
      where: { id: input.workspaceId },
    });

    const user =
      isDefined(workspace) &&
      !NOT_READY_ACTIVATION_STATUSES.includes(workspace.activationStatus)
        ? await this.userRepository.findOne({ where: { email: input.email } })
        : null;

    const userWorkspace =
      isDefined(workspace) && isDefined(user)
        ? await this.userWorkspaceService.getUserWorkspaceForUser({
            userId: user.id,
            workspaceId: workspace.id,
            relations: [],
          })
        : null;

    if (
      !isDefined(workspace) ||
      !isDefined(user) ||
      !isDefined(userWorkspace)
    ) {
      throw new NotFoundException('Workspace member not found');
    }

    // The token exchange would reject it anyway; failing here avoids handing out a dead link
    if (
      this.twentyConfigService.get('IS_EMAIL_VERIFICATION_REQUIRED') &&
      !user.isEmailVerified
    ) {
      throw new ConflictException('Workspace member e-mail is not verified');
    }

    await this.applyMemberSettings({
      workspaceId: workspace.id,
      userId: user.id,
      userWorkspaceId: userWorkspace.id,
      locale: input.locale,
      colorScheme: input.colorScheme,
    });

    // Password yields the same session as a password sign-in; Impersonation would add the banner and audit trail
    const loginToken = await this.loginTokenService.generateLoginToken(
      user.email,
      workspace.id,
      AuthProviderEnum.Password,
    );

    const url = this.workspaceDomainsService.buildWorkspaceURL({
      workspace,
      pathname: AppPath.Verify,
      searchParams: {
        loginToken: loginToken.token,
        ...(isDefined(input.returnToPath)
          ? { returnToPath: input.returnToPath }
          : {}),
      },
    });

    this.logger.log(
      `Issued login link for ${maskEmail(user.email)} in workspace ${workspace.id}`,
    );

    return {
      url: url.toString(),
      expiresAt: loginToken.expiresAt.toISOString(),
    };
  }

  // Same writes as the updateWorkspaceMemberSettings mutation; a failure must not block the sign-in
  private async applyMemberSettings({
    workspaceId,
    userId,
    userWorkspaceId,
    locale,
    colorScheme,
  }: {
    workspaceId: string;
    userId: string;
    userWorkspaceId: string;
    locale?: WschatBridgeLoginLinkInput['locale'];
    colorScheme?: WschatBridgeLoginLinkInput['colorScheme'];
  }): Promise<void> {
    if (!isDefined(locale) && !isDefined(colorScheme)) {
      return;
    }

    const authContext = buildSystemAuthContext(workspaceId);

    try {
      await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
        const workspaceMemberRepository =
          this.workspaceOrmManager.getRepositoryWithoutPermissionChecks<WorkspaceMemberWorkspaceEntity>(
            'workspaceMember',
          );

        const workspaceMember = await workspaceMemberRepository.findOne({
          where: { userId },
        });

        if (!isDefined(workspaceMember)) {
          throw new Error('Workspace member row not found');
        }

        await workspaceMemberRepository.save({
          id: workspaceMember.id,
          ...(isDefined(locale) ? { locale } : {}),
          ...(isDefined(colorScheme) ? { colorScheme } : {}),
        });
      }, authContext);

      if (isDefined(locale)) {
        await this.userWorkspaceService.updateUserWorkspaceLocaleForUserWorkspace(
          { locale, userWorkspaceId },
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not apply member settings in workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
