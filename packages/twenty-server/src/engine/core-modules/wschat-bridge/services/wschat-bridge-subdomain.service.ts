import { HttpStatus, Injectable } from '@nestjs/common';

import { SubdomainManagerService } from 'src/engine/core-modules/domain/subdomain-manager/services/subdomain-manager.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { classifyBridgeSubdomain } from 'src/engine/core-modules/wschat-bridge/utils/classify-bridge-subdomain.util';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';

@Injectable()
export class WschatBridgeSubdomainService {
  constructor(
    private readonly subdomainManagerService: SubdomainManagerService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  // Pre-check with distinct codes; the upstream create/update path re-validates and its unique index is the final word
  async assertUsableOrThrow(subdomain: string): Promise<void> {
    const verdict = classifyBridgeSubdomain({
      subdomain,
      reservedByConfig: [
        this.twentyConfigService.get('DEFAULT_SUBDOMAIN'),
        ...this.twentyConfigService.get('ADDITIONAL_RESERVED_SUBDOMAINS'),
      ],
    });

    if (verdict === 'invalid') {
      throw wschatBridgeHttpException(
        HttpStatus.BAD_REQUEST,
        WSCHAT_BRIDGE_ERROR_CODES.SUBDOMAIN_INVALID,
        'Subdomain is not valid',
      );
    }

    if (verdict === 'reserved') {
      throw wschatBridgeHttpException(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.SUBDOMAIN_RESERVED,
        'Subdomain is reserved',
      );
    }

    // Soft-deleted workspaces still hold their subdomain (isSubdomainAvailable reads withDeleted)
    if (!(await this.subdomainManagerService.isSubdomainAvailable(subdomain))) {
      throw wschatBridgeHttpException(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.SUBDOMAIN_TAKEN,
        'Subdomain already taken',
      );
    }
  }
}
