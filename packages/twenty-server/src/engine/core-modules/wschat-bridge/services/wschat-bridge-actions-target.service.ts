import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString, isObject, isString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { KeyValuePairType } from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { KeyValuePairService } from 'src/engine/core-modules/key-value-pair/key-value-pair.service';
import {
  WSCHAT_BRIDGE_ACTIONS_TARGET_KEY,
  type WschatBridgeActionsTarget,
  type WschatBridgeActionsTargetKeyValueTypesMap,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-actions-target.constant';
import { authorizeWschatActionsRequest } from 'src/engine/core-modules/wschat-bridge/utils/authorize-wschat-actions-request.util';

const TARGET_ROW = {
  type: KeyValuePairType.CONFIG_VARIABLE,
  userId: null,
  key: WSCHAT_BRIDGE_ACTIONS_TARGET_KEY,
} as const;

// Name and driver code only: a query error carries its parameters, the token among them
const describeError = (error: unknown): string =>
  error instanceof Error
    ? `${error.name}${'code' in error && isString(error.code) ? ` ${error.code}` : ''}`
    : typeof error;

// WSChat's actions endpoint and token as the last enforce brought them. The token lives only here:
// workflow steps carry none, the HTTP step adds it when calling this endpoint (README, "WSChat token")
@Injectable()
export class WschatBridgeActionsTargetService {
  private readonly logger = new Logger(WschatBridgeActionsTargetService.name);

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

  // Whether a target is stored after this call. Never throws: enforce and creation go on without it.
  // Written only when it changed, so the hourly sweep does not rewrite the row
  async store(
    workspaceId: string,
    target: WschatBridgeActionsTarget | undefined,
  ): Promise<boolean> {
    try {
      const stored = await this.find(workspaceId);

      if (!isDefined(target)) {
        return isDefined(stored);
      }

      if (stored?.url !== target.url || stored.token !== target.token) {
        await this.keyValuePairService.set({
          ...TARGET_ROW,
          workspaceId,
          value: { url: target.url, token: target.token },
        });
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Workspace ${workspaceId}: actions target not stored (${describeError(error)})`,
      );

      return false;
    }
  }

  // For a workflow HTTP step: the request with the token when it calls this workspace's endpoint, else undefined.
  // A failed lookup only leaves the request as it is, so other HTTP steps never fail because of it
  async authorizeRequest<
    TInput extends { url: string; headers?: Record<string, string> },
  >({
    workspaceId,
    input,
  }: {
    workspaceId: string;
    input: TInput;
  }): Promise<TInput | undefined> {
    try {
      return authorizeWschatActionsRequest({
        input,
        target: await this.find(workspaceId),
      });
    } catch (error) {
      this.logger.error(
        `Workspace ${workspaceId}: WSChat token lookup failed (${describeError(error)})`,
      );

      return undefined;
    }
  }
}
