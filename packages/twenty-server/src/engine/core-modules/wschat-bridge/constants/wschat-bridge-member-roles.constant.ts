// The two standard roles the bridge can assign; custom roles are only reported, never assigned
export const WSCHAT_BRIDGE_MEMBER_ROLES = ['admin', 'member'] as const;

export type WschatBridgeMemberRole =
  (typeof WSCHAT_BRIDGE_MEMBER_ROLES)[number];
