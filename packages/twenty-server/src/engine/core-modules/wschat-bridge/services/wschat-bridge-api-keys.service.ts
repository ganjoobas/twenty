import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type ApiKeyEntity } from 'src/engine/core-modules/api-key/api-key.entity';
import { ApiKeyRoleService } from 'src/engine/core-modules/api-key/services/api-key-role.service';
import { ApiKeyService } from 'src/engine/core-modules/api-key/services/api-key.service';
import {
  WSCHAT_BRIDGE_API_KEY_DEFAULT_LIFETIME_IN_DAYS,
  WSCHAT_BRIDGE_MAX_ACTIVE_API_KEYS,
  WSCHAT_BRIDGE_SERVICE_KEY_NAME,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-api-keys.constant';
import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { WSCHAT_BRIDGE_API_ROLE } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-managed-roles.constant';
import {
  type WschatBridgeApiKeyDTO,
  type WschatBridgeCreatedApiKeyDTO,
  type WschatBridgeRevokedApiKeyDTO,
} from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-api-key.dto';
import { type WschatBridgeCreateApiKeyInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-create-api-key.input';
import { type WschatBridgeServiceKeyDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-service-key.dto';
import { WschatBridgeManagedRoleService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-managed-role.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { isReservedApiKeyName } from 'src/engine/core-modules/wschat-bridge/utils/is-reserved-api-key-name.util';
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

    const apiKeys = await this.findCompanyKeys(workspace.id);

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

    const name = input.name.trim();

    if (isReservedApiKeyName(name)) {
      throw wschatBridgeHttpException(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.RESERVED_KEY_NAME,
        `The name ${WSCHAT_BRIDGE_SERVICE_KEY_NAME} is reserved for WSChat's own key`,
      );
    }

    const expiresAt = isDefined(input.expiresAt)
      ? new Date(input.expiresAt)
      : this.buildDefaultExpiry();

    if (expiresAt.getTime() <= Date.now()) {
      throw wschatBridgeHttpException(
        HttpStatus.BAD_REQUEST,
        WSCHAT_BRIDGE_ERROR_CODES.INVALID_INPUT,
        'expiresAt must be in the future',
      );
    }

    const usableKeys = (await this.findCompanyKeys(workspace.id)).filter(
      (apiKey) => !this.apiKeyService.isExpired(apiKey),
    );

    if (usableKeys.length >= WSCHAT_BRIDGE_MAX_ACTIVE_API_KEYS) {
      throw wschatBridgeHttpException(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.API_KEY_LIMIT_REACHED,
        `At most ${WSCHAT_BRIDGE_MAX_ACTIVE_API_KEYS} active API keys per workspace`,
      );
    }

    const { id, token } = await this.issueKey({
      workspaceId: workspace.id,
      name,
      expiresAt,
    });

    this.logger.log(`Workspace ${workspace.id}: API key ${id} created`);

    return { id, name, expiresAt: expiresAt.toISOString(), token };
  }

  // New key first, old ones revoked after: WSChat can switch over before the old token stops working, and a
  // failed revoke leaves an extra valid key (revoked on the next rotation), never no key at all
  async rotateServiceKey(
    workspaceId: string,
  ): Promise<WschatBridgeServiceKeyDTO> {
    const workspace =
      await this.workspaceLookupService.findProvisionedOrThrow(workspaceId);

    const previousServiceKeys = (
      await this.findApiRoleKeys(workspace.id)
    ).filter(({ name }) => isReservedApiKeyName(name));

    const expiresAt = this.buildDefaultExpiry();
    const { id, token } = await this.issueKey({
      workspaceId: workspace.id,
      name: WSCHAT_BRIDGE_SERVICE_KEY_NAME,
      expiresAt,
    });

    for (const previousServiceKey of previousServiceKeys) {
      await this.apiKeyService.revoke(previousServiceKey.id, workspace.id);
    }

    this.logger.log(
      `Workspace ${workspace.id}: service key ${id} issued, ${previousServiceKeys.length} previous revoked`,
    );

    return { id, token, expiresAt: expiresAt.toISOString() };
  }

  async revokeApiKey(
    workspaceId: string,
    apiKeyId: string,
  ): Promise<WschatBridgeRevokedApiKeyDTO> {
    const workspace =
      await this.workspaceLookupService.findProvisionedOrThrow(workspaceId);

    const apiKey = (await this.findApiRoleKeys(workspace.id)).find(
      ({ id }) => id === apiKeyId,
    );

    if (!isDefined(apiKey)) {
      return { revoked: false };
    }

    if (isReservedApiKeyName(apiKey.name)) {
      throw wschatBridgeHttpException(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.SERVICE_KEY,
        "WSChat's own key is rotated through the service-key endpoint only",
      );
    }

    await this.apiKeyService.revoke(apiKeyId, workspace.id);

    this.logger.log(`Workspace ${workspace.id}: API key ${apiKeyId} revoked`);

    return { revoked: true };
  }

  // Any active key without the API role was not issued by the bridge (or was re-roled), so it is drift.
  // The service key holds the API role, so it always survives this step
  async enforce(workspaceId: string): Promise<{
    foreignApiKeysRevoked: number;
    activeApiKeys: number;
    serviceKeyActive: boolean;
  }> {
    const { roleId } = await this.managedRoleService.ensure({
      workspaceId,
      role: WSCHAT_BRIDGE_API_ROLE,
    });

    const apiRoleKeys = await this.apiKeyRoleService.getApiKeysAssignedToRole(
      roleId,
      workspaceId,
    );
    const apiRoleKeyIds = new Set(apiRoleKeys.map(({ id }) => id));

    const foreignApiKeys = (
      await this.apiKeyService.findActiveByWorkspaceId(workspaceId)
    ).filter((apiKey) => !apiRoleKeyIds.has(apiKey.id));

    for (const foreignApiKey of foreignApiKeys) {
      await this.apiKeyService.revoke(foreignApiKey.id, workspaceId);
    }

    return {
      foreignApiKeysRevoked: foreignApiKeys.length,
      activeApiKeys: apiRoleKeys.filter(
        ({ name }) => !isReservedApiKeyName(name),
      ).length,
      serviceKeyActive: apiRoleKeys.some(({ name }) =>
        isReservedApiKeyName(name),
      ),
    };
  }

  private buildDefaultExpiry(): Date {
    return new Date(
      Date.now() +
        WSCHAT_BRIDGE_API_KEY_DEFAULT_LIFETIME_IN_DAYS * DAY_IN_MILLISECONDS,
    );
  }

  // A key whose token could not be issued is useless; revoking (not deleting) keeps the audit trail
  private async issueKey({
    workspaceId,
    name,
    expiresAt,
  }: {
    workspaceId: string;
    name: string;
    expiresAt: Date;
  }): Promise<{ id: string; token: string }> {
    const { roleId } = await this.managedRoleService.ensure({
      workspaceId,
      role: WSCHAT_BRIDGE_API_ROLE,
    });

    const apiKey = await this.apiKeyService.create({
      name,
      expiresAt,
      revokedAt: null,
      roleId,
      workspaceId,
    });

    const generatedToken = await this.apiKeyService
      .generateApiKeyToken(workspaceId, apiKey.id, expiresAt)
      .catch(async (error: unknown) => {
        await this.apiKeyService.revoke(apiKey.id, workspaceId);
        throw error;
      });

    if (!isDefined(generatedToken)) {
      await this.apiKeyService.revoke(apiKey.id, workspaceId);
      throw new Error(`No token generated for API key ${apiKey.id}`);
    }

    return { id: apiKey.id, token: generatedToken.token };
  }

  // The keys companies see and manage: everything on the API role except WSChat's own key
  private async findCompanyKeys(workspaceId: string): Promise<ApiKeyEntity[]> {
    return (await this.findApiRoleKeys(workspaceId)).filter(
      ({ name }) => !isReservedApiKeyName(name),
    );
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
