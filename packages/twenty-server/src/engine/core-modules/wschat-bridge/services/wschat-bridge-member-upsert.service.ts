import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type WschatBridgeUpsertedMemberDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-member.dto';
import { type WschatBridgeUpsertMemberInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-upsert-member.input';
import { WschatBridgeMemberReadService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-read.service';
import { WschatBridgeMemberSettingsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-settings.service';
import { WschatBridgeOnboardingService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-onboarding.service';
import { WschatBridgeRolesService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-roles.service';
import { WschatBridgeUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-user.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { maskEmail } from 'src/engine/core-modules/wschat-bridge/utils/mask-email.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

@Injectable()
export class WschatBridgeMemberUpsertService {
  private readonly logger = new Logger(WschatBridgeMemberUpsertService.name);

  constructor(
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly upstreamUserService: UserService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
    private readonly userService: WschatBridgeUserService,
    private readonly rolesService: WschatBridgeRolesService,
    private readonly memberSettingsService: WschatBridgeMemberSettingsService,
    private readonly onboardingService: WschatBridgeOnboardingService,
    private readonly memberReadService: WschatBridgeMemberReadService,
  ) {}

  // Idempotent: repeating the same call converges to the same member, and also repairs a membership an earlier
  // failed call left half-made (membership row without workspaceMember row or role)
  async upsertMember(
    workspaceId: string,
    input: WschatBridgeUpsertMemberInput,
  ): Promise<WschatBridgeUpsertedMemberDTO> {
    const workspace =
      await this.workspaceLookupService.findProvisionedOrThrow(workspaceId);

    const roleId = await this.rolesService.resolveRoleIdOrThrow({
      workspaceId: workspace.id,
      role: input.role,
    });

    const { user } = await this.userService.findOrCreate(input);

    const existingUserWorkspace =
      await this.userWorkspaceService.checkUserWorkspaceExists(
        user.id,
        workspace.id,
      );

    const created = !isDefined(existingUserWorkspace);

    if (created) {
      // Upstream's join path (seat limit, workspaceMember row, role, invitation cleanup), with the role chosen here
      await this.userWorkspaceService.addUserToWorkspaceIfUserNotInWorkspace(
        user,
        workspace,
        roleId,
      );
    } else {
      await this.ensureWorkspaceMemberRow(workspace, user);
    }

    const userWorkspace =
      await this.userWorkspaceService.getUserWorkspaceForUserOrThrow({
        userId: user.id,
        workspaceId: workspace.id,
        relations: [],
      });

    // Before the profile writes, so a refused demotion of the last Admin changes nothing
    await this.rolesService.assignIfDifferent({
      workspaceId: workspace.id,
      userWorkspaceId: userWorkspace.id,
      roleId,
    });

    await this.memberSettingsService.apply({
      workspaceId: workspace.id,
      userId: user.id,
      userWorkspaceId: userWorkspace.id,
      profile: input,
    });

    await this.userService.markEmailVerified(user);

    await this.onboardingService.completeAllSteps({
      userId: user.id,
      workspaceId: workspace.id,
    });

    this.logger.log(
      `Workspace ${workspace.id}: member ${maskEmail(user.email)} ${created ? 'added' : 'updated'} as ${input.role}`,
    );

    return {
      ...(await this.memberReadService.getMemberOrThrow(workspace, user.id)),
      created,
    };
  }

  private async ensureWorkspaceMemberRow(
    workspace: WorkspaceEntity,
    user: UserEntity,
  ): Promise<void> {
    const workspaceMember = await this.upstreamUserService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (isDefined(workspaceMember)) {
      return;
    }

    await this.userWorkspaceService.createWorkspaceMember(workspace.id, user);

    // Same invalidation as addUserToWorkspaceIfUserNotInWorkspace: role checks read members from this cache
    await this.workspaceCacheService.invalidateAndRecompute(workspace.id, [
      'flatWorkspaceMemberMaps',
    ]);
  }
}
