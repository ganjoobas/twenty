import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type ApiKeyEntity } from 'src/engine/core-modules/api-key/api-key.entity';
import { ApiKeyRoleService } from 'src/engine/core-modules/api-key/services/api-key-role.service';
import { ApiKeyService } from 'src/engine/core-modules/api-key/services/api-key.service';
import {
  WSCHAT_BRIDGE_API_KEY_DEFAULT_LIFETIME_IN_DAYS,
  WSCHAT_BRIDGE_MAX_ACTIVE_API_KEYS,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-api-keys.constant';
import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { WSCHAT_BRIDGE_API_ROLE } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-managed-roles.constant';
import {
  type WschatBridgeApiKeyDTO,
  type WschatBridgeCreatedApiKeyDTO,
  type WschatBridgeRevokedApiKeyDTO,
} from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-api-key.dto';
import { type WschatBridgeCreateApiKeyInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-create-api-key.input';
import { WschatBridgeManagedRoleService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-managed-role.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

// Keys are issued only here and only with the API role: upstream key creation needs ROLES, which nobody human holds
@Injectable()
export class WschatBridgeApiKeysService {
  private readonly logger = new Logger(WschatBridgeApiKeysService.name);

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly apiKeyRoleService: ApiKeyRoleService,
    private readonly managedRoleService: WschatBridgeManagedRoleService,
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
  ) {}

  async listApiKeys(workspaceId: string): Promise<WschatBridgeApiKeyDTO[]> {
    const workspace =
      await this.workspaceLookupService.findProvisionedOrThrow(workspaceId);

    const apiKeys = await this.findApiRoleKeys(workspace.id);

    return apiKeys.map((apiKey) => ({
      id: apiKey.id,
      name: apiKey.name,
      expiresAt: apiKey.expiresAt.toISOString(),
      createdAt: apiKey.createdAt.toISOString(),
    }));
  }

  async createApiKey(
    workspaceId: string,
    input: WschatBridgeCreateApiKeyInput,
  ): Promise<WschatBridgeCreatedApiKeyDTO> {
    const workspace =
      await this.workspaceLookupService.findProvisionedOrThrow(workspaceId);

    const expiresAt = isDefined(input.expiresAt)
      ? new Date(input.expiresAt)
      : new Date(
          Date.now() +
            WSCHAT_BRIDGE_API_KEY_DEFAULT_LIFETIME_IN_DAYS *
              DAY_IN_MILLISECONDS,
        );

    if (expiresAt.getTime() <= Date.now()) {
      throw wschatBridgeHttpException(
        HttpStatus.BAD_REQUEST,
        WSCHAT_BRIDGE_ERROR_CODES.INVALID_INPUT,
        'expiresAt must be in the future',
      );
    }

    const usableKeys = (await this.findApiRoleKeys(workspace.id)).filter(
      (apiKey) => !this.apiKeyService.isExpired(apiKey),
    );

    if (usableKeys.length >= WSCHAT_BRIDGE_MAX_ACTIVE_API_KEYS) {
      throw wschatBridgeHttpException(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.API_KEY_LIMIT_REACHED,
        `At most ${WSCHAT_BRIDGE_MAX_ACTIVE_API_KEYS} active API keys per workspace`,
      );
    }

    const { roleId } = await this.managedRoleService.ensure({
      workspaceId: workspace.id,
      role: WSCHAT_BRIDGE_API_ROLE,
    });

    const apiKey = await this.apiKeyService.create({
      name: input.name.trim(),
      expiresAt,
      revokedAt: null,
      roleId,
      workspaceId: workspace.id,
    });

    // A key whose token could not be issued is useless; revoking (not deleting) keeps the audit trail
    const generatedToken = await this.apiKeyService
      .generateApiKeyToken(workspace.id, apiKey.id, expiresAt)
      .catch(async (error: unknown) => {
        await this.apiKeyService.revoke(apiKey.id, workspace.id);
        throw error;
      });

    if (!isDefined(generatedToken)) {
      await this.apiKeyService.revoke(apiKey.id, workspace.id);
      throw new Error(`No token generated for API key ${apiKey.id}`);
    }

    this.logger.log(`Workspace ${workspace.id}: API key ${apiKey.id} created`);

    return {
      id: apiKey.id,
      name: apiKey.name,
      expiresAt: expiresAt.toISOString(),
      token: generatedToken.token,
    };
  }

  async revokeApiKey(
    workspaceId: string,
    apiKeyId: string,
  ): Promise<WschatBridgeRevokedApiKeyDTO> {
    const workspace =
      await this.workspaceLookupService.findProvisionedOrThrow(workspaceId);

    const isBridgeKey = (await this.findApiRoleKeys(workspace.id)).some(
      (apiKey) => apiKey.id === apiKeyId,
    );

    if (!isBridgeKey) {
      return { revoked: false };
    }

    await this.apiKeyService.revoke(apiKeyId, workspace.id);

    this.logger.log(`Workspace ${workspace.id}: API key ${apiKeyId} revoked`);

    return { revoked: true };
  }

  // Any active key without the API role was not issued by the bridge (or was re-roled), so it is drift
  async enforce(
    workspaceId: string,
  ): Promise<{ foreignApiKeysRevoked: number; activeApiKeys: number }> {
    const { roleId } = await this.managedRoleService.ensure({
      workspaceId,
      role: WSCHAT_BRIDGE_API_ROLE,
    });

    const apiRoleKeyIds = new Set(
      (
        await this.apiKeyRoleService.getApiKeysAssignedToRole(
          roleId,
          workspaceId,
        )
      ).map(({ id }) => id),
    );

    const foreignApiKeys = (
      await this.apiKeyService.findActiveByWorkspaceId(workspaceId)
    ).filter((apiKey) => !apiRoleKeyIds.has(apiKey.id));

    for (const foreignApiKey of foreignApiKeys) {
      await this.apiKeyService.revoke(foreignApiKey.id, workspaceId);
    }

    return {
      foreignApiKeysRevoked: foreignApiKeys.length,
      activeApiKeys: apiRoleKeyIds.size,
    };
  }

  // Active (not revoked) keys holding the API role; none while the role does not exist yet
  private async findApiRoleKeys(workspaceId: string): Promise<ApiKeyEntity[]> {
    const roleId = await this.managedRoleService.findRoleId({
      workspaceId,
      role: WSCHAT_BRIDGE_API_ROLE,
    });

    if (!isDefined(roleId)) {
      return [];
    }

    return this.apiKeyRoleService.getApiKeysAssignedToRole(roleId, workspaceId);
  }
}
