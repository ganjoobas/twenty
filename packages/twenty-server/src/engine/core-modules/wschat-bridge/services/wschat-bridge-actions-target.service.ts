import { Injectable } from '@nestjs/common';

import { isNonEmptyString, isObject } from '@sniptt/guards';

import { KeyValuePairType } from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { KeyValuePairService } from 'src/engine/core-modules/key-value-pair/key-value-pair.service';
import {
  WSCHAT_BRIDGE_ACTIONS_TARGET_KEY,
  type WschatBridgeActionsTargetKeyValueTypesMap,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-actions-target.constant';
import { type WschatBridgeActionsTarget } from 'src/engine/core-modules/wschat-bridge/utils/build-sample-action-workflows.util';

const TARGET_ROW = {
  type: KeyValuePairType.CONFIG_VARIABLE,
  userId: null,
  key: WSCHAT_BRIDGE_ACTIONS_TARGET_KEY,
} as const;

// WSChat's actions endpoint and token as the last enforce brought them, for the AI chat's WSChat step tool
@Injectable()
export class WschatBridgeActionsTargetService {
  constructor(
    private readonly keyValuePairService: KeyValuePairService<WschatBridgeActionsTargetKeyValueTypesMap>,
  ) {}

  async find(
    workspaceId: string,
  ): Promise<WschatBridgeActionsTarget | undefined> {
    const [row] = await this.keyValuePairService.get({
      ...TARGET_ROW,
      workspaceId,
    });
    const value: unknown = row?.value;

    return isObject(value) &&
      'url' in value &&
      'token' in value &&
      isNonEmptyString(value.url) &&
      isNonEmptyString(value.token)
      ? { url: value.url, token: value.token }
      : undefined;
  }

  // Written only when it changed, so the hourly sweep does not rewrite the row
  async store(
    workspaceId: string,
    target: WschatBridgeActionsTarget,
  ): Promise<void> {
    const stored = await this.find(workspaceId);

    if (stored?.url === target.url && stored.token === target.token) {
      return;
    }

    await this.keyValuePairService.set({
      ...TARGET_ROW,
      workspaceId,
      value: { url: target.url, token: target.token },
    });
  }
}
