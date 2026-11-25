import { HttpStatus, Injectable } from '@nestjs/common';

import { MEMBER_ROLE_UNIVERSAL_IDENTIFIER } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { type WschatBridgeMemberRole } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-member-roles.constant';
import { WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-managed-roles.constant';
import { WschatBridgeManagedRoleService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-managed-role.service';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { RoleAssignmentWriteService } from 'src/engine/permissions/role-assignment/role-assignment-write.service';
import { RolePermissionsService } from 'src/engine/permissions/role-permissions.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

@Injectable()
export class WschatBridgeRolesService {
  constructor(
    private readonly roleService: RoleService,
    private readonly rolePermissionsService: RolePermissionsService,
    private readonly roleAssignmentWriteService: RoleAssignmentWriteService,
    private readonly managedRoleService: WschatBridgeManagedRoleService,
  ) {}

  // Bridge "admin" is the company-admin role (created on demand); the standard Admin is kept for the service user
  async resolveRoleIdOrThrow({
    workspaceId,
    role,
  }: {
    workspaceId: string;
    role: WschatBridgeMemberRole;
  }): Promise<string> {
    if (role === 'admin') {
      const { roleId } = await this.managedRoleService.ensure({
        workspaceId,
        role: WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE,
      });

      return roleId;
    }

    return this.resolveMemberRoleIdOrThrow(workspaceId);
  }

  async resolveMemberRoleIdOrThrow(workspaceId: string): Promise<string> {
    return this.resolveStandardRoleIdOrThrow({
      workspaceId,
      universalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
    });
  }

  async resolveStandardAdminRoleIdOrThrow(
    workspaceId: string,
  ): Promise<string> {
    return this.resolveStandardRoleIdOrThrow({
      workspaceId,
      universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
    });
  }

  // Both standard roles exist in every activated workspace (setupDefaultRoles)
  private async resolveStandardRoleIdOrThrow({
    workspaceId,
    universalIdentifier,
  }: {
    workspaceId: string;
    universalIdentifier: string;
  }): Promise<string> {
    const roleDto = await this.roleService.getRoleByUniversalIdentifier({
      universalIdentifier,
      workspaceId,
    });

    if (!isDefined(roleDto)) {
      throw wschatBridgeHttpException(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.ROLE_NOT_FOUND,
        `Standard role ${universalIdentifier} does not exist in this workspace`,
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
