import { type WschatBridgeActionsTarget } from 'src/engine/core-modules/wschat-bridge/utils/build-sample-action-workflows.util';

// A workspace-level core.keyValuePair row (type CONFIG_VARIABLE, no user, no application), as the assistants flag
export const WSCHAT_BRIDGE_ACTIONS_TARGET_KEY = 'WSCHAT_ACTIONS_TARGET';

export type WschatBridgeActionsTargetKeyValueTypesMap = {
  [WSCHAT_BRIDGE_ACTIONS_TARGET_KEY]: WschatBridgeActionsTarget;
};
