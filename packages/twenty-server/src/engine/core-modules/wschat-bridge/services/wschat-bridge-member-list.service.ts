import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { WschatBridgeServiceUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-service-user.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { toBridgeRoleName } from 'src/engine/core-modules/wschat-bridge/utils/to-bridge-role-name.util';
import { RolePermissionsService } from 'src/engine/permissions/role-permissions.service';

export type WschatBridgeListedMemberDTO = {
  email: string;
  role: 'admin' | 'member' | 'other';
  service: boolean;
  serverAdmin: boolean;
};

// Every current member, the service user included, so WSChat can find and remove what it no longer has
@Injectable()
export class WschatBridgeMemberListService {
  constructor(
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly rolePermissionsService: RolePermissionsService,
    private readonly serviceUserService: WschatBridgeServiceUserService,
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
  ) {}

  async listAllMembers(
    workspaceId: string,
  ): Promise<{ members: WschatBridgeListedMemberDTO[] }> {
    const workspace =
      await this.workspaceLookupService.findOrThrow(workspaceId);
    // Soft-deleted users load without their user row and are not current members
    const userWorkspaces = (
      await this.userWorkspaceRepository.find({
        where: { workspaceId: workspace.id },
        relations: { user: true },
        order: { createdAt: 'ASC' },
      })
    ).filter(({ user }) => isDefined(user));
    const rolesByUserWorkspaceId =
      await this.rolePermissionsService.findRolesByUserWorkspaceIds({
        userWorkspaceIds: userWorkspaces.map(({ id }) => id),
        workspaceId: workspace.id,
      });

    return {
      members: userWorkspaces.map(({ id, user }) => {
        const role = toBridgeRoleName(rolesByUserWorkspaceId.get(id)?.[0]);

        return {
          email: user.email.toLowerCase(),
          role: role === 'admin' || role === 'member' ? role : 'other',
          service: this.serviceUserService.isServiceUserEmail(user.email),
          serverAdmin: user.canAccessFullAdminPanel,
        };
      }),
    };
  }
}
