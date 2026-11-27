// WSChat's endpoint for actions taken by CRM workflows, and this workspace's token for it
export type WschatBridgeActionsTarget = { url: string; token: string };

// A workspace-level core.keyValuePair row (type CONFIG_VARIABLE, no user, no application), as the assistants flag
export const WSCHAT_BRIDGE_ACTIONS_TARGET_KEY = 'WSCHAT_ACTIONS_TARGET';

export type WschatBridgeActionsTargetKeyValueTypesMap = {
  [WSCHAT_BRIDGE_ACTIONS_TARGET_KEY]: WschatBridgeActionsTarget;
};
