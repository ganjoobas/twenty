import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { type WschatBridgeRemovedMemberDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-member.dto';
import { WschatBridgeRolesService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-roles.service';
import { WschatBridgeServiceUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-service-user.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { maskEmail } from 'src/engine/core-modules/wschat-bridge/utils/mask-email.util';
import { normalizeBridgeEmail } from 'src/engine/core-modules/wschat-bridge/utils/normalize-bridge-email.util';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';

@Injectable()
export class WschatBridgeMemberRemovalService {
  private readonly logger = new Logger(WschatBridgeMemberRemovalService.name);

  constructor(
    private readonly userService: UserService,
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
    private readonly rolesService: WschatBridgeRolesService,
    private readonly serviceUserService: WschatBridgeServiceUserService,
  ) {}

  async removeMember(
    workspaceId: string,
    rawEmail: string,
  ): Promise<WschatBridgeRemovedMemberDTO> {
    this.serviceUserService.assertNotServiceUserOrThrow(rawEmail);

    const workspace =
      await this.workspaceLookupService.findProvisionedOrThrow(workspaceId);
    const email = normalizeBridgeEmail(rawEmail);

    const user = await this.userService.findUserByEmail(email);

    const userWorkspace = isDefined(user)
      ? await this.userWorkspaceService.checkUserWorkspaceExists(
          user.id,
          workspace.id,
        )
      : null;

    if (!isDefined(user) || !isDefined(userWorkspace)) {
      return { removed: false };
    }

    await this.assertNotLastMemberOrThrow(workspace);

    // Upstream would refuse too, but only after its own last-member branch; checking first keeps the bridge away from it
    await this.rolesService.assertNotLastAdminOrThrow({
      workspaceId: workspace.id,
      userWorkspaceId: userWorkspace.id,
    });

    // The deleteUserFromWorkspace mutation's service call: ownership transfer to a successor, workspaceMember and
    // membership removal, caches, and soft-delete of the user when this was their last workspace
    await this.userService.deleteUserWorkspaceAndPotentiallyDeleteUser({
      userId: user.id,
      workspaceId: workspace.id,
    });

    this.logger.log(
      `Workspace ${workspace.id}: member ${maskEmail(email)} removed`,
    );

    return { removed: true };
  }

  // Upstream suspends and soft-deletes the whole workspace when it removes the only workspaceMember row; both the
  // membership count and that row count are checked, since a half-made member can make them differ
  private async assertNotLastMemberOrThrow(
    workspace: WorkspaceEntity,
  ): Promise<void> {
    const membershipCount =
      (await this.userWorkspaceService.getUserCount(workspace.id)) ?? 0;
    const workspaceMembers =
      await this.userService.loadWorkspaceMembers(workspace);

    if (membershipCount > 1 && workspaceMembers.length > 1) {
      return;
    }

    throw wschatBridgeHttpException(
      HttpStatus.CONFLICT,
      WSCHAT_BRIDGE_ERROR_CODES.LAST_MEMBER,
      'The last member of a workspace cannot be removed',
    );
  }
}
