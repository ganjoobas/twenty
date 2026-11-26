import { Injectable } from '@nestjs/common';

import { ApplicationAuthorizationService } from 'src/engine/core-modules/application/application-authorization/services/application-authorization.service';
import { isOAuthOnlyApplication } from 'src/engine/core-modules/application/utils/is-oauth-only-application.util';
import { KeyValuePairType } from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { KeyValuePairService } from 'src/engine/core-modules/key-value-pair/key-value-pair.service';
import {
  WSCHAT_BRIDGE_ASSISTANTS_ENABLED_KEY,
  type WschatBridgeAssistantsKeyValueTypesMap,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-assistants.constant';

export type WschatBridgeAssistantsState = {
  assistantsEnabled: boolean;
  // Active grants of OAuth-only applications (MCP clients, the CLI) revoked by this call
  assistantAuthorizationsRevoked: number;
};

const FLAG_ROW = {
  type: KeyValuePairType.CONFIG_VARIABLE,
  userId: null,
  key: WSCHAT_BRIDGE_ASSISTANTS_ENABLED_KEY,
} as const;

// Whether external assistants (MCP / OAuth clients) may reach a workspace; off unless WSChat turned it on
@Injectable()
export class WschatBridgeAssistantsService {
  constructor(
    private readonly keyValuePairService: KeyValuePairService<WschatBridgeAssistantsKeyValueTypesMap>,
    private readonly applicationAuthorizationService: ApplicationAuthorizationService,
  ) {}

  // Read on every gated request, never cached, so switching off takes effect at once
  async isEnabled(workspaceId: string): Promise<boolean> {
    const rows = await this.keyValuePairService.get({
      ...FLAG_ROW,
      workspaceId,
    });

    return rows.some((row) => row.value === true);
  }

  // `enabled` absent only reports; while off, every call revokes the grants
  // assistants already hold, so their access tokens stop working on REST and GraphQL too
  async apply(
    workspaceId: string,
    enabled: boolean | undefined,
  ): Promise<WschatBridgeAssistantsState> {
    if (enabled === true) {
      await this.keyValuePairService.set({
        ...FLAG_ROW,
        workspaceId,
        value: true,
      });
    } else if (enabled === false) {
      await this.keyValuePairService.delete({ ...FLAG_ROW, workspaceId });
    }

    const assistantsEnabled = enabled ?? (await this.isEnabled(workspaceId));

    return {
      assistantsEnabled,
      assistantAuthorizationsRevoked: assistantsEnabled
        ? 0
        : await this.revokeAssistantAuthorizations(workspaceId),
    };
  }

  private async revokeAssistantAuthorizations(
    workspaceId: string,
  ): Promise<number> {
    const authorizations =
      await this.applicationAuthorizationService.findActiveAuthorizationsForWorkspace(
        { workspaceId },
      );

    let revoked = 0;

    for (const authorization of authorizations) {
      if (
        isOAuthOnlyApplication(authorization.application) &&
        (await this.applicationAuthorizationService.revokeAuthorizationByIdForWorkspace(
          { authorizationId: authorization.id, workspaceId },
        ))
      ) {
        revoked++;
      }
    }

    return revoked;
  }
}
