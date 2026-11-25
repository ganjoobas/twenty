import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { MEMBER_ROLE_UNIVERSAL_IDENTIFIER } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { ApiKeyService } from 'src/engine/core-modules/api-key/services/api-key.service';
import { ApprovedAccessDomainService } from 'src/engine/core-modules/approved-access-domain/services/approved-access-domain.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceInvitationService } from 'src/engine/core-modules/workspace-invitation/services/workspace-invitation.service';
import { WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_UNIVERSAL_IDENTIFIER } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-company-admin-role.constant';
import { type WschatBridgeEnforceReportDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-enforce-report.dto';
import { WschatBridgeCompanyAdminRoleService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-company-admin-role.service';
import { WschatBridgeMembershipService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-membership.service';
import { WschatBridgeOnboardingService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-onboarding.service';
import { WschatBridgeRolesService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-roles.service';
import { WschatBridgeServiceUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-service-user.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { WschatBridgeWorkspaceSettingsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-settings.service';
import { RoleAssignmentWriteService } from 'src/engine/permissions/role-assignment/role-assignment-write.service';
import { RolePermissionsService } from 'src/engine/permissions/role-permissions.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

// Every step checks before writing, so the whole run can simply be repeated after a failure part-way
@Injectable()
export class WschatBridgeWorkspaceEnforcementService {
  private readonly logger = new Logger(
    WschatBridgeWorkspaceEnforcementService.name,
  );

  constructor(
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly rolePermissionsService: RolePermissionsService,
    private readonly roleAssignmentWriteService: RoleAssignmentWriteService,
    private readonly workspaceInvitationService: WorkspaceInvitationService,
    private readonly approvedAccessDomainService: ApprovedAccessDomainService,
    private readonly apiKeyService: ApiKeyService,
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
    private readonly serviceUserService: WschatBridgeServiceUserService,
    private readonly rolesService: WschatBridgeRolesService,
    private readonly membershipService: WschatBridgeMembershipService,
    private readonly companyAdminRoleService: WschatBridgeCompanyAdminRoleService,
    private readonly onboardingService: WschatBridgeOnboardingService,
    private readonly workspaceSettingsService: WschatBridgeWorkspaceSettingsService,
  ) {}

  async enforce(
    workspaceId: string,
    adminRoleLabel?: string,
  ): Promise<WschatBridgeEnforceReportDTO> {
    const workspace =
      await this.workspaceLookupService.findProvisionedOrThrow(workspaceId);

    const serviceUserAdded = await this.ensureServiceUserIsAdmin(workspace);

    const companyAdminRole = await this.companyAdminRoleService.ensure({
      workspaceId: workspace.id,
      label: adminRoleLabel?.trim(),
    });

    const { convertedAdmins, unexpectedRoles } = await this.convertHumanAdmins(
      workspace,
      companyAdminRole.roleId,
    );

    const settingsFixed =
      await this.workspaceSettingsService.enforceOwnedSettings(workspace.id);

    const report: WschatBridgeEnforceReportDTO = {
      serviceUserAdded,
      adminRoleCreated: companyAdminRole.created,
      adminRoleFlagsFixed: companyAdminRole.fixed,
      convertedAdmins,
      unexpectedRoles,
      settingsFixed,
      invitationsDeleted: await this.deleteInvitations(workspace),
      approvedDomainsDeleted: await this.deleteApprovedDomains(workspace),
      activeApiKeys: (
        await this.apiKeyService.findActiveByWorkspaceId(workspace.id)
      ).length,
      sso: 'not checked',
    };

    this.logger.log(
      `Workspace ${workspace.id}: enforced ${JSON.stringify(report)}`,
    );

    return report;
  }

  // Must hold the standard Admin before any human loses it, so the last-admin rule is never hit
  private async ensureServiceUserIsAdmin(
    workspace: WorkspaceEntity,
  ): Promise<boolean> {
    const serviceUser = await this.serviceUserService.findOrCreate();

    const { created } = await this.membershipService.ensure({
      workspace,
      user: serviceUser,
      roleId: await this.rolesService.resolveStandardAdminRoleIdOrThrow(
        workspace.id,
      ),
    });

    await this.onboardingService.completeAllSteps({
      userId: serviceUser.id,
      workspaceId: workspace.id,
    });

    return created;
  }

  private async convertHumanAdmins(
    workspace: WorkspaceEntity,
    companyAdminRoleId: string,
  ): Promise<{ convertedAdmins: number; unexpectedRoles: number }> {
    const humanUserWorkspaces = (
      await this.userWorkspaceRepository.find({
        where: { workspaceId: workspace.id },
        relations: { user: true },
      })
    ).filter(
      (userWorkspace) =>
        isDefined(userWorkspace.user) &&
        !this.serviceUserService.isServiceUserEmail(userWorkspace.user.email),
    );

    const rolesByUserWorkspaceId =
      await this.rolePermissionsService.findRolesByUserWorkspaceIds({
        userWorkspaceIds: humanUserWorkspaces.map(({ id }) => id),
        workspaceId: workspace.id,
      });

    const humanAdminUserWorkspaceIds: string[] = [];
    let unexpectedRoles = 0;

    for (const userWorkspace of humanUserWorkspaces) {
      const roleUniversalIdentifier = rolesByUserWorkspaceId.get(
        userWorkspace.id,
      )?.[0]?.universalIdentifier;

      if (roleUniversalIdentifier === STANDARD_ROLE.admin.universalIdentifier) {
        humanAdminUserWorkspaceIds.push(userWorkspace.id);
      } else if (
        roleUniversalIdentifier !==
          WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_UNIVERSAL_IDENTIFIER &&
        roleUniversalIdentifier !== MEMBER_ROLE_UNIVERSAL_IDENTIFIER
      ) {
        unexpectedRoles++;
      }
    }

    // One call for all: the last-admin check then sees the service user remain
    if (humanAdminUserWorkspaceIds.length > 0) {
      await this.roleAssignmentWriteService.assignRoleToUserWorkspaces({
        workspaceId: workspace.id,
        userWorkspaceIds: humanAdminUserWorkspaceIds,
        roleId: companyAdminRoleId,
      });
    }

    return {
      convertedAdmins: humanAdminUserWorkspaceIds.length,
      unexpectedRoles,
    };
  }

  private async deleteInvitations(workspace: WorkspaceEntity): Promise<number> {
    const invitations =
      await this.workspaceInvitationService.loadWorkspaceInvitations(workspace);

    let deletedCount = 0;

    for (const invitation of invitations) {
      const result =
        await this.workspaceInvitationService.deleteWorkspaceInvitation(
          invitation.id,
          workspace.id,
        );

      if (result === 'success') {
        deletedCount++;
      }
    }

    return deletedCount;
  }

  private async deleteApprovedDomains(
    workspace: WorkspaceEntity,
  ): Promise<number> {
    const approvedAccessDomains =
      await this.approvedAccessDomainService.getApprovedAccessDomains(
        workspace,
      );

    for (const approvedAccessDomain of approvedAccessDomains) {
      await this.approvedAccessDomainService.deleteApprovedAccessDomain(
        workspace,
        approvedAccessDomain.id,
      );
    }

    return approvedAccessDomains.length;
  }
}
