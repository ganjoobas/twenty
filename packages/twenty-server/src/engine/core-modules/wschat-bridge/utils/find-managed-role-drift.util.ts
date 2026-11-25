import { type WschatBridgeManagedRoleSettings } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-managed-roles.constant';

export const findManagedRoleSettingsDrift = (
  current: WschatBridgeManagedRoleSettings,
  expected: WschatBridgeManagedRoleSettings,
): (keyof WschatBridgeManagedRoleSettings)[] =>
  (Object.keys(expected) as (keyof WschatBridgeManagedRoleSettings)[]).filter(
    (setting) => current[setting] !== expected[setting],
  );

// Exact set comparison: an extra flag is drift just like a missing one
export const isPermissionFlagSetExact = (
  currentFlags: string[],
  expectedFlags: string[],
): boolean => {
  const currentFlagSet = new Set(currentFlags);

  return (
    currentFlagSet.size === new Set(expectedFlags).size &&
    expectedFlags.every((flag) => currentFlagSet.has(flag))
  );
};
