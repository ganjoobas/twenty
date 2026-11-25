import { MEMBER_ROLE_UNIVERSAL_IDENTIFIER } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import { WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_UNIVERSAL_IDENTIFIER } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-company-admin-role.constant';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

// Standard roles are matched by universal identifier: their labels can be translated or renamed, the identifiers cannot
export const toBridgeRoleName = (
  role: { universalIdentifier: string; label: string } | undefined,
): string | null => {
  if (!isDefined(role)) {
    return null;
  }

  // A human still on the standard Admin role (before enforce converts them) is a company admin too
  if (
    role.universalIdentifier ===
      WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_UNIVERSAL_IDENTIFIER ||
    role.universalIdentifier === STANDARD_ROLE.admin.universalIdentifier
  ) {
    return 'admin';
  }

  if (role.universalIdentifier === MEMBER_ROLE_UNIVERSAL_IDENTIFIER) {
    return 'member';
  }

  return role.label;
};
