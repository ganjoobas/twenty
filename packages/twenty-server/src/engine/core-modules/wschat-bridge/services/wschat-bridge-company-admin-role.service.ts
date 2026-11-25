import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import {
  WSCHAT_BRIDGE_COMPANY_ADMIN_PERMISSION_FLAGS,
  WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_DEFAULT_LABEL,
  WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_SETTINGS,
  WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-company-admin-role.constant';
import {
  findCompanyAdminRoleSettingsDrift,
  isCompanyAdminPermissionFlagSetExact,
} from 'src/engine/core-modules/wschat-bridge/utils/find-company-admin-role-drift.util';
import { RolePermissionFlagService } from 'src/engine/metadata-modules/role-permission-flag/role-permission-flag.service';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';

export type WschatBridgeCompanyAdminRoleResult = {
  roleId: string;
  created: boolean;
  fixed: boolean;
};

@Injectable()
export class WschatBridgeCompanyAdminRoleService {
  constructor(
    private readonly roleService: RoleService,
    private readonly rolePermissionFlagService: RolePermissionFlagService,
    private readonly applicationService: ApplicationService,
  ) {}

  // Creates the role if missing, otherwise re-applies label (only when given), switches and flags that drifted
  async ensure({
    workspaceId,
    label,
  }: {
    workspaceId: string;
    label?: string;
  }): Promise<WschatBridgeCompanyAdminRoleResult> {
    const existingRole = await this.roleService.getRoleByUniversalIdentifier({
      universalIdentifier:
        WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
      workspaceId,
    });

    if (!isDefined(existingRole)) {
      const roleId = await this.create({ workspaceId, label });

      return { roleId, created: true, fixed: false };
    }

    const isLabelDrifted = isDefined(label) && existingRole.label !== label;
    const isSettingsDrifted =
      findCompanyAdminRoleSettingsDrift(existingRole).length > 0;

    if (isLabelDrifted || isSettingsDrifted) {
      await this.roleService.updateRole({
        input: {
          id: existingRole.id,
          update: {
            ...WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_SETTINGS,
            ...(isLabelDrifted ? { label } : {}),
          },
        },
        workspaceId,
      });
    }

    // getRoleByUniversalIdentifier returns no flags; getRoleById loads them
    const roleWithFlags = await this.roleService.getRoleById(
      existingRole.id,
      workspaceId,
    );
    const isFlagsDrifted = !isCompanyAdminPermissionFlagSetExact(
      roleWithFlags?.permissionFlags?.map(({ flag }) => flag) ?? [],
    );

    if (isFlagsDrifted) {
      await this.applyPermissionFlags({ workspaceId, roleId: existingRole.id });
    }

    return {
      roleId: existingRole.id,
      created: false,
      fixed: isLabelDrifted || isSettingsDrifted || isFlagsDrifted,
    };
  }

  // Owned by the workspace custom application, like the standard Member role (RoleService.createMemberRole)
  private async create({
    workspaceId,
    label,
  }: {
    workspaceId: string;
    label?: string;
  }): Promise<string> {
    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );

    const role = await this.roleService.createRole({
      input: {
        universalIdentifier:
          WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
        label: label ?? WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_DEFAULT_LABEL,
        description: 'Company admin managed by WSChat',
        icon: 'IconUserCog',
        ...WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_SETTINGS,
      },
      workspaceId,
      ownerFlatApplication: workspaceCustomFlatApplication,
    });

    await this.applyPermissionFlags({ workspaceId, roleId: role.id });

    return role.id;
  }

  // upsertPermissionFlags replaces the role's whole flag set: missing flags are added, extra ones removed
  private async applyPermissionFlags({
    workspaceId,
    roleId,
  }: {
    workspaceId: string;
    roleId: string;
  }): Promise<void> {
    await this.rolePermissionFlagService.upsertPermissionFlags({
      workspaceId,
      input: {
        roleId,
        permissionFlagKeys: [...WSCHAT_BRIDGE_COMPANY_ADMIN_PERMISSION_FLAGS],
      },
    });
  }
}
