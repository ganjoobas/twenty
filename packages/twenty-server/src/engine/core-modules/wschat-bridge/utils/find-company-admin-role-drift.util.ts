import {
  WSCHAT_BRIDGE_COMPANY_ADMIN_PERMISSION_FLAGS,
  WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_SETTINGS,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-company-admin-role.constant';

type CompanyAdminRoleSettings = {
  -readonly [
    TKey in keyof typeof WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_SETTINGS
  ]: boolean;
};

export const findCompanyAdminRoleSettingsDrift = (
  role: CompanyAdminRoleSettings,
): (keyof CompanyAdminRoleSettings)[] =>
  (
    Object.keys(
      WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_SETTINGS,
    ) as (keyof CompanyAdminRoleSettings)[]
  ).filter(
    (setting) =>
      role[setting] !== WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_SETTINGS[setting],
  );

// Exact set comparison: an extra flag is drift just like a missing one
export const isCompanyAdminPermissionFlagSetExact = (
  currentFlags: string[],
): boolean => {
  const currentFlagSet = new Set(currentFlags);

  return (
    currentFlagSet.size ===
      WSCHAT_BRIDGE_COMPANY_ADMIN_PERMISSION_FLAGS.length &&
    WSCHAT_BRIDGE_COMPANY_ADMIN_PERMISSION_FLAGS.every((flag) =>
      currentFlagSet.has(flag),
    )
  );
};
