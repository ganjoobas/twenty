import { HttpStatus, Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { WSCHAT_BRIDGE_SERVICE_USER_FIRST_NAME } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-service-user.constant';
import { WschatBridgeUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-user.service';
import { normalizeBridgeEmail } from 'src/engine/core-modules/wschat-bridge/utils/normalize-bridge-email.util';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';

// The only holder of the standard Admin role in bridge workspaces; one core.user shared by all of them
@Injectable()
export class WschatBridgeServiceUserService {
  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly userService: WschatBridgeUserService,
  ) {}

  getEmail(): string | null {
    const email = this.twentyConfigService.get(
      'WSCHAT_BRIDGE_SERVICE_USER_EMAIL',
    );

    return isNonEmptyString(email) ? normalizeBridgeEmail(email) : null;
  }

  getEmailOrThrow(): string {
    const email = this.getEmail();

    if (email === null) {
      throw wschatBridgeHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        WSCHAT_BRIDGE_ERROR_CODES.SERVICE_USER_NOT_CONFIGURED,
        'WSCHAT_BRIDGE_SERVICE_USER_EMAIL is not set',
      );
    }

    return email;
  }

  isServiceUserEmail(email: string): boolean {
    return this.getEmail() === normalizeBridgeEmail(email);
  }

  assertNotServiceUserOrThrow(email: string): void {
    if (this.isServiceUserEmail(email)) {
      throw wschatBridgeHttpException(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.SERVICE_USER,
        'The WSChat service user cannot be managed through the bridge',
      );
    }
  }

  async findOrCreate(): Promise<UserEntity> {
    const { user } = await this.userService.findOrCreate({
      email: this.getEmailOrThrow(),
      firstName: WSCHAT_BRIDGE_SERVICE_USER_FIRST_NAME,
      lastName: '',
    });

    return user;
  }
}
