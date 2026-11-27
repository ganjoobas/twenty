import { isNonEmptyString } from '@sniptt/guards';

import { type ObjectRecordFilter } from 'src/engine/api/graphql/workspace-query-builder/interfaces/object-record.interface';

import { normalizeBridgeEmail } from 'src/engine/core-modules/wschat-bridge/utils/normalize-bridge-email.util';

// The service member keeps authorship ("created by WSChat") but is never offered as a person to pick
export const isWschatServiceMemberEmail = (
  userEmail: string | null | undefined,
  serviceEmail: string | null | undefined,
): boolean =>
  isNonEmptyString(userEmail) &&
  isNonEmptyString(serviceEmail) &&
  normalizeBridgeEmail(userEmail) === normalizeBridgeEmail(serviceEmail);

// workspaceMember.userEmail is copied from the lowercased core.user.email, so a plain neq matches it
export const excludeWschatServiceMemberFromFilter = (
  objectNameSingular: string,
  filter: ObjectRecordFilter,
  serviceEmail: string | null | undefined,
): ObjectRecordFilter => {
  if (
    objectNameSingular !== 'workspaceMember' ||
    !isNonEmptyString(serviceEmail)
  ) {
    return filter;
  }

  const exclusion = {
    or: [
      { userEmail: { neq: normalizeBridgeEmail(serviceEmail) } },
      { userEmail: { is: 'NULL' } },
    ],
  };

  return {
    and: Object.keys(filter).length > 0 ? [filter, exclusion] : [exclusion],
  };
};
