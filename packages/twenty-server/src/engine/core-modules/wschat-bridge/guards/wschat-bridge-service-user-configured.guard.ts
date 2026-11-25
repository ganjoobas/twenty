import { type CanActivate, Injectable } from '@nestjs/common';

import { WschatBridgeServiceUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-service-user.service';

// Workspace endpoints cannot keep the lockdown without a service user; the login link does not need one
@Injectable()
export class WschatBridgeServiceUserConfiguredGuard implements CanActivate {
  constructor(
    private readonly serviceUserService: WschatBridgeServiceUserService,
  ) {}

  canActivate(): boolean {
    this.serviceUserService.getEmailOrThrow();

    return true;
  }
}
