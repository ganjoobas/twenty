import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { MEMBER_ROLE_UNIVERSAL_IDENTIFIER } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { ApprovedAccessDomainService } from 'src/engine/core-modules/approved-access-domain/services/approved-access-domain.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceInvitationService } from 'src/engine/core-modules/workspace-invitation/services/workspace-invitation.service';
import { WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-managed-roles.constant';
import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { type WschatBridgeEnforceReportDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-enforce-report.dto';
import { WschatBridgeActionsTargetService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-actions-target.service';
import { WschatBridgeAssistantsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-assistants.service';
import { WschatBridgeApiKeysService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-api-keys.service';
import { WschatBridgeManagedRoleService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-managed-role.service';
import { WschatBridgeMembershipService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-membership.service';
import { WschatBridgeOnboardingService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-onboarding.service';
import { WschatBridgeRolesService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-roles.service';
import { type WschatBridgeLocale } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';
import {
  type WschatBridgeDataModelResult,
  WschatBridgeDataModelService,
} from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-data-model.service';
import { type WschatBridgeActionsTarget } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-actions-target.constant';
import { WschatBridgeStarterLayoutService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-starter-layout.service';
import { WschatBridgeServiceUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-service-user.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { WschatBridgeWorkspaceSettingsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-settings.service';
import { WebhookService } from 'src/engine/metadata-modules/webhook/webhook.service';
import { isSchemaBusyError } from 'src/engine/core-modules/wschat-bridge/utils/schema-busy-retry.util';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';
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
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
    private readonly serviceUserService: WschatBridgeServiceUserService,
    private readonly rolesService: WschatBridgeRolesService,
    private readonly membershipService: WschatBridgeMembershipService,
    private readonly managedRoleService: WschatBridgeManagedRoleService,
    private readonly apiKeysService: WschatBridgeApiKeysService,
    private readonly webhookService: WebhookService,
    private readonly dataModelService: WschatBridgeDataModelService,
    private readonly onboardingService: WschatBridgeOnboardingService,
    private readonly workspaceSettingsService: WschatBridgeWorkspaceSettingsService,
    private readonly assistantsService: WschatBridgeAssistantsService,
    private readonly starterLayoutService: WschatBridgeStarterLayoutService,
    private readonly actionsTargetService: WschatBridgeActionsTargetService,
  ) {}

  async enforce(
    workspaceId: string,
    {
      adminRoleLabel,
      locale,
      assistantsEnabled,
      actions,
    }: {
      adminRoleLabel?: string;
      locale?: WschatBridgeLocale;
      assistantsEnabled?: boolean;
      actions?: WschatBridgeActionsTarget;
    },
  ): Promise<WschatBridgeEnforceReportDTO> {
    const workspace =
      await this.workspaceLookupService.findProvisionedOrThrow(workspaceId);

    // First, so a later failing step never leaves assistants open
    const assistants = await this.assistantsService.apply(
      workspace.id,
      assistantsEnabled,
    );

    const serviceUserAdded = await this.ensureServiceUserIsAdmin(workspace);

    const companyAdminRole = await this.managedRoleService.ensure({
      workspaceId: workspace.id,
      role: WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE,
      label: adminRoleLabel?.trim(),
    });

    const { convertedAdmins, unexpectedRoles } = await this.convertHumanAdmins(
      workspace,
      companyAdminRole.roleId,
    );

    const { settingsFixed, iframeMediaPermissions } =
      await this.workspaceSettingsService.enforceOwnedSettings(workspace.id);

    const { foreignApiKeysRevoked, activeApiKeys, serviceKeyActive } =
      await this.apiKeysService.enforce(workspace.id);

    const invitationsDeleted = await this.deleteInvitations(workspace);
    const approvedDomainsDeleted = await this.deleteApprovedDomains(workspace);
    const webhooks = (await this.webhookService.findAll(workspace.id)).length;

    // After the lockdown, before the data model whose failure would keep it out; never fails the call
    const actionsTargetStored = await this.actionsTargetService.store(
      workspace.id,
      actions,
    );

    // Last on purpose: every lockdown step above has already been applied when the data model fails
    const dataModel = await this.ensureDataModelOrThrow(workspace.id, locale);

    // Needs our fields, so after the data model; reports its failures instead of throwing
    const starterLayout = await this.starterLayoutService.apply({
      workspaceId: workspace.id,
      locale: locale ?? 'en',
      actions,
    });

    const report: WschatBridgeEnforceReportDTO = {
      ...assistants,
      serviceUserAdded,
      adminRoleCreated: companyAdminRole.created,
      adminRoleFlagsFixed: companyAdminRole.fixed,
      convertedAdmins,
      unexpectedRoles,
      settingsFixed,
      invitationsDeleted,
      approvedDomainsDeleted,
      iframeMediaPermissions,
      foreignApiKeysRevoked,
      activeApiKeys,
      serviceKeyActive,
      webhooks,
      actionsTargetStored,
      sso: 'not checked',
      ...dataModel,
      ...starterLayout,
    };

    this.logger.log(
      `Workspace ${workspace.id}: enforced ${JSON.stringify(report)}`,
    );

    return report;
  }

  private async ensureDataModelOrThrow(
    workspaceId: string,
    locale?: WschatBridgeLocale,
  ): Promise<WschatBridgeDataModelResult> {
    try {
      return await this.dataModelService.ensure({ workspaceId, locale });
    } catch (error) {
      this.logger.error(
        `Workspace ${workspaceId}: lockdown applied, data model failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Still busy after the bounded wait: the caller repeats later (SCHEMA_BUSY), it is not a failure of the model
      if (isSchemaBusyError(error)) {
        throw error;
      }

      throw wschatBridgeHttpException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        WSCHAT_BRIDGE_ERROR_CODES.DATA_MODEL_FAILED,
        'Lockdown steps were applied; ensuring the WSChat data model failed. Repeat the call to finish it.',
      );
    }
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
          WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE.universalIdentifier &&
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
