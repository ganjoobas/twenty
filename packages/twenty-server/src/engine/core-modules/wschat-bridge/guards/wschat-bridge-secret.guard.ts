import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { createHash, timingSafeEqual } from 'crypto';

import { isNonEmptyString } from '@sniptt/guards';
import { type Request } from 'express';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WSCHAT_BRIDGE_MIN_SECRET_LENGTH } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-min-secret-length.constant';

const WSCHAT_BRIDGE_SECRET_HEADER = 'x-wschat-bridge-secret';

// Hashing first gives equal-length buffers, so neither the comparison nor an early length check leaks the secret's length
const digest = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class WschatBridgeSecretGuard implements CanActivate {
  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const secret = this.twentyConfigService.get('WSCHAT_BRIDGE_SECRET');

    // A disabled bridge answers exactly like Nest's unknown-route 404
    if (
      !isNonEmptyString(secret) ||
      secret.length < WSCHAT_BRIDGE_MIN_SECRET_LENGTH
    ) {
      throw new NotFoundException(`Cannot ${request.method} ${request.path}`);
    }

    const headerValue = request.headers[WSCHAT_BRIDGE_SECRET_HEADER];

    if (
      !isNonEmptyString(headerValue) ||
      !timingSafeEqual(digest(headerValue), digest(secret))
    ) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
