import { RESERVED_SUBDOMAINS } from 'twenty-shared/constants';
import { isValidTwentySubdomain } from 'twenty-shared/utils';

export type WschatBridgeSubdomainVerdict = 'valid' | 'invalid' | 'reserved';

// Same rules as SubdomainManagerService.validateSubdomainOrThrow, split so the caller can tell "reserved" from "bad format"
export const classifyBridgeSubdomain = ({
  subdomain,
  reservedByConfig,
}: {
  subdomain: string;
  reservedByConfig: string[];
}): WschatBridgeSubdomainVerdict => {
  if (!isValidTwentySubdomain(subdomain)) {
    return 'invalid';
  }

  const lowerCasedSubdomain = subdomain.toLowerCase();

  if (
    RESERVED_SUBDOMAINS.includes(lowerCasedSubdomain) ||
    reservedByConfig
      .map((reserved) => String(reserved).toLowerCase())
      .includes(lowerCasedSubdomain)
  ) {
    return 'reserved';
  }

  return 'valid';
};
