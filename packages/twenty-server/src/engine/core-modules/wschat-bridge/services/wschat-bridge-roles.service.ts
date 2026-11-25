import { HttpStatus, Injectable } from '@nestjs/common';

import { MEMBER_ROLE_UNIVERSAL_IDENTIFIER } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { type WschatBridgeMemberRole } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-member-roles.constant';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { RoleAssignmentWriteService } from 'src/engine/permissions/role-assignment/role-assignment-write.service';
import { RolePermissionsService } from 'src/engine/permissions/role-permissions.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

const UNIVERSAL_IDENTIFIER_BY_BRIDGE_ROLE: Record<
  WschatBridgeMemberRole,
  string
> = {
  admin: STANDARD_ROLE.admin.universalIdentifier,
  member: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
};

@Injectable()
export class WschatBridgeRolesService {
  constructor(
    private readonly roleService: RoleService,
    private readonly rolePermissionsService: RolePermissionsService,
    private readonly roleAssignmentWriteService: RoleAssignmentWriteService,
  ) {}

  // Looked up by universal identifier: the two standard roles exist in every activated workspace (setupDefaultRoles)
  async resolveRoleIdOrThrow({
    workspaceId,
    role,
  }: {
    workspaceId: string;
    role: WschatBridgeMemberRole;
  }): Promise<string> {
    const roleDto = await this.roleService.getRoleByUniversalIdentifier({
      universalIdentifier: UNIVERSAL_IDENTIFIER_BY_BRIDGE_ROLE[role],
      workspaceId,
    });

    if (!isDefined(roleDto)) {
      throw wschatBridgeHttpException(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.ROLE_NOT_FOUND,
        `The standard "${role}" role does not exist in this workspace`,
      );
    }

    return roleDto.id;
  }

  // Same checks as assignRoleToWorkspaceMember (updateWorkspaceMemberRole), keyed by userWorkspace instead of the
  // cached workspaceMember map; demoting the last Admin throws CANNOT_UNASSIGN_LAST_ADMIN before anything is written
  async assignIfDifferent({
    workspaceId,
    userWorkspaceId,
    roleId,
  }: {
    workspaceId: string;
    userWorkspaceId: string;
    roleId: string;
  }): Promise<void> {
    const currentRoles =
      await this.rolePermissionsService.findRolesByUserWorkspaceIds({
        userWorkspaceIds: [userWorkspaceId],
        workspaceId,
      });

    if (currentRoles.get(userWorkspaceId)?.[0]?.id === roleId) {
      return;
    }

    await this.roleAssignmentWriteService.assertRoleAssignableToUsersOrThrow({
      roleId,
      workspaceId,
    });

    await this.roleAssignmentWriteService.assignRoleToUserWorkspaces({
      workspaceId,
      userWorkspaceIds: [userWorkspaceId],
      roleId,
    });
  }

  async assertNotLastAdminOrThrow({
    workspaceId,
    userWorkspaceId,
  }: {
    workspaceId: string;
    userWorkspaceId: string;
  }): Promise<void> {
    await this.roleAssignmentWriteService.assertUserWorkspaceIsNotUniqueAdminOrThrow(
      { workspaceId, userWorkspaceId },
    );
  }
}
