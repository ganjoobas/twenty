import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { WschatBridgeAssistantsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-assistants.service';
import { type WschatBridgeUpdateWorkspaceInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-update-workspace.input';
import { WschatBridgeSubdomainService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-subdomain.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { WschatBridgeWorkspaceSettingsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-settings.service';

@Injectable()
export class WschatBridgeWorkspaceUpdateService {
  private readonly logger = new Logger(WschatBridgeWorkspaceUpdateService.name);

  constructor(
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
    private readonly subdomainService: WschatBridgeSubdomainService,
    private readonly workspaceSettingsService: WschatBridgeWorkspaceSettingsService,
    private readonly assistantsService: WschatBridgeAssistantsService,
  ) {}

  async updateWorkspace(
    workspaceId: string,
    input: WschatBridgeUpdateWorkspaceInput,
  ): Promise<void> {
    const workspace =
      await this.workspaceLookupService.findProvisionedOrThrow(workspaceId);

    const displayName = input.displayName?.trim();
    const requestedSubdomain = input.subdomain?.trim();
    const subdomain =
      requestedSubdomain === workspace.subdomain
        ? undefined
        : requestedSubdomain;

    // All validation first, so a refusal leaves the workspace untouched
    if (isDefined(subdomain)) {
      await this.subdomainService.assertUsableOrThrow(subdomain);
    }

    const embeddingOrigins = isDefined(input.allowedEmbeddingOrigins)
      ? this.workspaceSettingsService.normalizeEmbeddingOriginsOrThrow(
          input.allowedEmbeddingOrigins,
        )
      : undefined;

    await this.workspaceSettingsService.updateCoreFields({
      workspaceId: workspace.id,
      fields: { displayName, subdomain },
    });

    if (isDefined(embeddingOrigins)) {
      await this.workspaceSettingsService.setEmbeddingOrigins({
        workspaceId: workspace.id,
        origins: embeddingOrigins,
      });
    }

    if (isDefined(input.assistantsEnabled)) {
      await this.assistantsService.apply(workspace.id, input.assistantsEnabled);
    }

    const changedFields = [
      isDefined(displayName) ? 'displayName' : null,
      isDefined(subdomain) ? 'subdomain' : null,
      isDefined(embeddingOrigins) ? 'allowedEmbeddingOrigins' : null,
      isDefined(input.assistantsEnabled) ? 'assistantsEnabled' : null,
    ].filter(isDefined);

    this.logger.log(
      `Workspace ${workspace.id}: updated ${changedFields.join(', ') || 'nothing'}`,
    );
  }
}
