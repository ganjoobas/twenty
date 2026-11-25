import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { TwoFactorAuthenticationMethodEntity } from 'src/engine/core-modules/two-factor-authentication/entities/two-factor-authentication-method.entity';
import { TwoFactorAuthenticationBackupCodeService } from 'src/engine/core-modules/two-factor-authentication/services/two-factor-authentication-backup-code.service';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { WschatBridgeServiceUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-service-user.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { maskEmail } from 'src/engine/core-modules/wschat-bridge/utils/mask-email.util';
import { normalizeBridgeEmail } from 'src/engine/core-modules/wschat-bridge/utils/normalize-bridge-email.util';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

// No human holds SECURITY in a bridge workspace, so a member locked out by their own TOTP is reset from WSChat
@Injectable()
export class WschatBridgeMemberTwoFactorService {
  private readonly logger = new Logger(WschatBridgeMemberTwoFactorService.name);

  constructor(
    @InjectWorkspaceScopedRepository(TwoFactorAuthenticationMethodEntity)
    private readonly twoFactorAuthenticationMethodRepository: WorkspaceScopedRepository<TwoFactorAuthenticationMethodEntity>,
    private readonly twoFactorAuthenticationBackupCodeService: TwoFactorAuthenticationBackupCodeService,
    private readonly userService: UserService,
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly serviceUserService: WschatBridgeServiceUserService,
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
  ) {}

  // The same two writes as the deleteTwoFactorAuthenticationMethod mutation, for every method of that membership
  async resetTwoFactor(
    workspaceId: string,
    rawEmail: string,
  ): Promise<{ reset: boolean }> {
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
      return { reset: false };
    }

    const { affected } =
      await this.twoFactorAuthenticationMethodRepository.delete(workspace.id, {
        userWorkspaceId: userWorkspace.id,
      });

    await this.twoFactorAuthenticationBackupCodeService.revokeBackupCodes({
      userId: user.id,
      workspaceId: workspace.id,
    });

    const reset = (affected ?? 0) > 0;

    if (reset) {
      this.logger.log(
        `Workspace ${workspace.id}: two-factor reset for ${maskEmail(email)}`,
      );
    }

    return { reset };
  }
}
