import { PermissionFlagType } from 'twenty-shared/constants';

// Fixed so every bridge workspace's company-admin role is recognisable whatever its label
export const WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_UNIVERSAL_IDENTIFIER =
  'fa1f5cda-89e7-4647-9ab5-210407f4aa5b';

export const WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_DEFAULT_LABEL = 'Company admin';

// Role-level switches: Admin-like record and tool access, no settings beyond the allow-list below
export const WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_SETTINGS = {
  canUpdateAllSettings: false,
  canAccessAllTools: true,
  canAccessAllAgentChatChannels: true,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: true,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
} as const;

// Allow-list: people, sign-in, workspace, roles and API keys stay with WSChat
export const WSCHAT_BRIDGE_COMPANY_ADMIN_PERMISSION_FLAGS: PermissionFlagType[] =
  [
    PermissionFlagType.DATA_MODEL,
    PermissionFlagType.WORKFLOWS,
    PermissionFlagType.LAYOUTS,
    PermissionFlagType.AI_SETTINGS,
  ];
