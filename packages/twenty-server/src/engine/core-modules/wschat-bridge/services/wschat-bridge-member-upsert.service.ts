import { Injectable, Logger } from '@nestjs/common';

import { type WschatBridgeUpsertedMemberDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-member.dto';
import { type WschatBridgeUpsertMemberInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-upsert-member.input';
import { WschatBridgeMemberReadService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-read.service';
import { WschatBridgeMemberSettingsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-settings.service';
import { WschatBridgeMembershipService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-membership.service';
import { WschatBridgeOnboardingService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-onboarding.service';
import { WschatBridgeRolesService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-roles.service';
import { WschatBridgeServiceUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-service-user.service';
import { WschatBridgeUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-user.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { maskEmail } from 'src/engine/core-modules/wschat-bridge/utils/mask-email.util';

@Injectable()
export class WschatBridgeMemberUpsertService {
  private readonly logger = new Logger(WschatBridgeMemberUpsertService.name);

  constructor(
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
    private readonly serviceUserService: WschatBridgeServiceUserService,
    private readonly userService: WschatBridgeUserService,
    private readonly rolesService: WschatBridgeRolesService,
    private readonly membershipService: WschatBridgeMembershipService,
    private readonly memberSettingsService: WschatBridgeMemberSettingsService,
    private readonly onboardingService: WschatBridgeOnboardingService,
    private readonly memberReadService: WschatBridgeMemberReadService,
  ) {}

  // Idempotent: repeating the same call converges to the same member
  async upsertMember(
    workspaceId: string,
    input: WschatBridgeUpsertMemberInput,
  ): Promise<WschatBridgeUpsertedMemberDTO> {
    this.serviceUserService.assertNotServiceUserOrThrow(input.email);

    const workspace =
      await this.workspaceLookupService.findProvisionedOrThrow(workspaceId);

    const roleId = await this.rolesService.resolveRoleIdOrThrow({
      workspaceId: workspace.id,
      role: input.role,
    });

    const { user } = await this.userService.findOrCreate(input);

    const { created, userWorkspaceId } = await this.membershipService.ensure({
      workspace,
      user,
      roleId,
    });

    await this.memberSettingsService.apply({
      workspaceId: workspace.id,
      userId: user.id,
      userWorkspaceId,
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
}
