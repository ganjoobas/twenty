import { PermissionFlagType } from 'twenty-shared/constants';

export type WschatBridgeManagedRoleSettings = {
  canUpdateAllSettings: boolean;
  canAccessAllTools: boolean;
  canAccessAllAgentChatChannels: boolean;
  canReadAllObjectRecords: boolean;
  canUpdateAllObjectRecords: boolean;
  canSoftDeleteAllObjectRecords: boolean;
  canDestroyAllObjectRecords: boolean;
  canBeAssignedToUsers: boolean;
  canBeAssignedToAgents: boolean;
  canBeAssignedToApiKeys: boolean;
};

// A role the bridge creates and keeps exact; the fixed universal identifier recognises it whatever its label
export type WschatBridgeManagedRole = {
  universalIdentifier: string;
  defaultLabel: string;
  description: string;
  icon: string;
  settings: WschatBridgeManagedRoleSettings;
  permissionFlags: PermissionFlagType[];
};

// Admin-like record and tool access; settings by allow-list: people, sign-in, workspace, roles and API keys stay with WSChat
export const WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE: WschatBridgeManagedRole = {
  universalIdentifier: 'fa1f5cda-89e7-4647-9ab5-210407f4aa5b',
  defaultLabel: 'Company admin',
  description: 'Company admin managed by WSChat',
  icon: 'IconUserCog',
  settings: {
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
  },
  permissionFlags: [
    PermissionFlagType.DATA_MODEL,
    PermissionFlagType.WORKFLOWS,
    PermissionFlagType.LAYOUTS,
    PermissionFlagType.AI_SETTINGS,
  ],
};

// For bridge-issued API keys only: records without destroy, no tools, no settings at all
export const WSCHAT_BRIDGE_API_ROLE: WschatBridgeManagedRole = {
  universalIdentifier: 'a2b125d5-8aeb-4272-b482-e27d70e9b3c4',
  defaultLabel: 'API',
  description: 'API keys issued by WSChat',
  icon: 'IconApi',
  settings: {
    canUpdateAllSettings: false,
    canAccessAllTools: false,
    canAccessAllAgentChatChannels: false,
    canReadAllObjectRecords: true,
    canUpdateAllObjectRecords: true,
    canSoftDeleteAllObjectRecords: true,
    canDestroyAllObjectRecords: false,
    canBeAssignedToUsers: false,
    canBeAssignedToAgents: false,
    canBeAssignedToApiKeys: true,
  },
  permissionFlags: [],
};
