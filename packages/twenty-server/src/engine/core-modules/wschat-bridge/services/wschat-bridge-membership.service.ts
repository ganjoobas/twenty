import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WschatBridgeRolesService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-roles.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

@Injectable()
export class WschatBridgeMembershipService {
  constructor(
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly upstreamUserService: UserService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly rolesService: WschatBridgeRolesService,
  ) {}

  // Idempotent: also repairs a membership an earlier failed call left half-made (no workspaceMember row or role)
  async ensure({
    workspace,
    user,
    roleId,
  }: {
    workspace: WorkspaceEntity;
    user: UserEntity;
    roleId: string;
  }): Promise<{ created: boolean; userWorkspaceId: string }> {
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

    // Before any profile write, so a refused demotion of the last Admin changes nothing
    await this.rolesService.assignIfDifferent({
      workspaceId: workspace.id,
      userWorkspaceId: userWorkspace.id,
      roleId,
    });

    return { created, userWorkspaceId: userWorkspace.id };
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
