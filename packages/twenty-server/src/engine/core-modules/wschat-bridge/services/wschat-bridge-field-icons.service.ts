import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { WSCHAT_BRIDGE_FIELD_ICONS } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-starter-layout.constant';
import { retryWhileSchemaBusy } from 'src/engine/core-modules/wschat-bridge/utils/schema-busy-retry.util';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

// A field not created yet is skipped silently: the data model creates it with the new icon
@Injectable()
export class WschatBridgeFieldIconsService {
  constructor(
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly fieldMetadataService: FieldMetadataService,
  ) {}

  async apply(
    workspaceId: string,
  ): Promise<{ changed: string[]; skipped: string[] }> {
    const { flatFieldMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatFieldMetadataMaps',
      ]);
    const result = { changed: [] as string[], skipped: [] as string[] };

    for (const definition of WSCHAT_BRIDGE_FIELD_ICONS) {
      const field =
        flatFieldMetadataMaps.byUniversalIdentifier[
          definition.fieldUniversalIdentifier
        ];

      if (!isDefined(field) || field.icon === definition.icon) {
        continue;
      }

      if (field.icon !== definition.factory) {
        result.skipped.push(definition.reportName);
        continue;
      }

      await retryWhileSchemaBusy(() =>
        this.fieldMetadataService.updateOneField({
          updateFieldInput: { id: field.id, icon: definition.icon },
          workspaceId,
          shouldDeferActions: false,
        }),
      );
      result.changed.push(definition.reportName);
    }

    return result;
  }
}
