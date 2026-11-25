import { Injectable } from '@nestjs/common';

import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { type WschatBridgeManagedRole } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-managed-roles.constant';
import {
  findManagedRoleSettingsDrift,
  isPermissionFlagSetExact,
} from 'src/engine/core-modules/wschat-bridge/utils/find-managed-role-drift.util';
import { RolePermissionFlagService } from 'src/engine/metadata-modules/role-permission-flag/role-permission-flag.service';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';

export type WschatBridgeManagedRoleResult = {
  roleId: string;
  created: boolean;
  fixed: boolean;
};

@Injectable()
export class WschatBridgeManagedRoleService {
  constructor(
    private readonly roleService: RoleService,
    private readonly rolePermissionFlagService: RolePermissionFlagService,
    private readonly applicationService: ApplicationService,
  ) {}

  async findRoleId({
    workspaceId,
    role,
  }: {
    workspaceId: string;
    role: WschatBridgeManagedRole;
  }): Promise<string | null> {
    const existingRole = await this.roleService.getRoleByUniversalIdentifier({
      universalIdentifier: role.universalIdentifier,
      workspaceId,
    });

    return existingRole?.id ?? null;
  }

  // Creates the role if missing, otherwise re-applies label (only when given), switches and flags that drifted
  async ensure({
    workspaceId,
    role,
    label,
  }: {
    workspaceId: string;
    role: WschatBridgeManagedRole;
    label?: string;
  }): Promise<WschatBridgeManagedRoleResult> {
    const existingRole = await this.roleService.getRoleByUniversalIdentifier({
      universalIdentifier: role.universalIdentifier,
      workspaceId,
    });

    if (!isDefined(existingRole)) {
      const roleId = await this.create({ workspaceId, role, label });

      return { roleId, created: true, fixed: false };
    }

    const isLabelDrifted = isDefined(label) && existingRole.label !== label;
    const isSettingsDrifted =
      findManagedRoleSettingsDrift(existingRole, role.settings).length > 0;

    if (isLabelDrifted || isSettingsDrifted) {
      await this.roleService.updateRole({
        input: {
          id: existingRole.id,
          update: {
            ...role.settings,
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
    const isFlagsDrifted = !isPermissionFlagSetExact(
      roleWithFlags?.permissionFlags?.map(({ flag }) => flag) ?? [],
      role.permissionFlags,
    );

    if (isFlagsDrifted) {
      await this.applyPermissionFlags({
        workspaceId,
        roleId: existingRole.id,
        role,
      });
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
    role,
    label,
  }: {
    workspaceId: string;
    role: WschatBridgeManagedRole;
    label?: string;
  }): Promise<string> {
    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );

    const createdRole = await this.roleService.createRole({
      input: {
        universalIdentifier: role.universalIdentifier,
        label: label ?? role.defaultLabel,
        description: role.description,
        icon: role.icon,
        ...role.settings,
      },
      workspaceId,
      ownerFlatApplication: workspaceCustomFlatApplication,
    });

    if (isNonEmptyArray(role.permissionFlags)) {
      await this.applyPermissionFlags({
        workspaceId,
        roleId: createdRole.id,
        role,
      });
    }

    return createdRole.id;
  }

  // upsertPermissionFlags replaces the role's whole flag set: missing flags are added, extra ones removed
  private async applyPermissionFlags({
    workspaceId,
    roleId,
    role,
  }: {
    workspaceId: string;
    roleId: string;
    role: WschatBridgeManagedRole;
  }): Promise<void> {
    await this.rolePermissionFlagService.upsertPermissionFlags({
      workspaceId,
      input: { roleId, permissionFlagKeys: [...role.permissionFlags] },
    });
  }
}
