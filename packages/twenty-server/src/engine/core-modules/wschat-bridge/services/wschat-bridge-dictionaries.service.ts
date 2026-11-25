import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined, isTagColor } from 'twenty-shared/utils';

import {
  WSCHAT_BRIDGE_FIELDS,
  WSCHAT_BRIDGE_PLACEHOLDER_OPTION,
  type WschatBridgeDictionary,
  type WschatBridgeLocale,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';
import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { type WschatBridgeDictionariesInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-dictionaries.input';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import {
  findDictionaryItemsProblem,
  planBridgeDictionaryOptions,
  type WschatBridgeCurrentOption,
  type WschatBridgeDictionaryItem,
  type WschatBridgeDictionaryStats,
} from 'src/engine/core-modules/wschat-bridge/utils/plan-bridge-dictionary-options.util';
import { retryWhileSchemaBusy } from 'src/engine/core-modules/wschat-bridge/utils/schema-busy-retry.util';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { resolveFlatFieldMetadataOptions } from 'src/engine/metadata-modules/flat-field-metadata-option/utils/resolve-flat-field-metadata-options.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

export type WschatBridgeDictionariesResult = Partial<
  Record<WschatBridgeDictionary, WschatBridgeDictionaryStats>
>;

// Per-company option lists of our SELECT fields; one workspace migration per field whose options really change
@Injectable()
export class WschatBridgeDictionariesService {
  private readonly logger = new Logger(WschatBridgeDictionariesService.name);

  constructor(
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly fieldMetadataService: FieldMetadataService,
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
  ) {}

  async apply(
    workspaceId: string,
    input: WschatBridgeDictionariesInput,
  ): Promise<WschatBridgeDictionariesResult> {
    const workspace =
      await this.workspaceLookupService.findProvisionedOrThrow(workspaceId);
    const locale = input.locale ?? 'en';
    const lists: [WschatBridgeDictionary, WschatBridgeDictionaryItem[]][] = [];

    if (isDefined(input.outcomes)) {
      lists.push(['outcomes', input.outcomes]);
    }

    if (isDefined(input.taskTypes)) {
      lists.push(['taskTypes', input.taskTypes]);
    }

    // Everything is validated before the first migration
    for (const [dictionary, items] of lists) {
      const problem = findDictionaryItemsProblem({
        items,
        reservedKeys: [WSCHAT_BRIDGE_PLACEHOLDER_OPTION.value],
      });

      if (isDefined(problem)) {
        throw wschatBridgeHttpException(
          HttpStatus.BAD_REQUEST,
          WSCHAT_BRIDGE_ERROR_CODES.DICTIONARY_INVALID,
          `${dictionary}: ${problem}`,
        );
      }
    }

    const result: WschatBridgeDictionariesResult = {};

    for (const [dictionary, items] of lists) {
      result[dictionary] = await this.applyList({
        workspaceId: workspace.id,
        dictionary,
        items,
        locale,
      });
    }

    return result;
  }

  // outcomes go to both wschatConversation.outcome and wschatCall.outcome; the stats are those of the first field
  private async applyList({
    workspaceId,
    dictionary,
    items,
    locale,
  }: {
    workspaceId: string;
    dictionary: WschatBridgeDictionary;
    items: WschatBridgeDictionaryItem[];
    locale: WschatBridgeLocale;
  }): Promise<WschatBridgeDictionaryStats> {
    const { flatFieldMetadataMaps, flatFieldMetadataOptionMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatFieldMetadataMaps',
        'flatFieldMetadataOptionMaps',
      ]);

    const fields = WSCHAT_BRIDGE_FIELDS.filter(
      (definition) => definition.dictionary === dictionary,
    ).map(
      ({ universalIdentifier }) =>
        flatFieldMetadataMaps.byUniversalIdentifier[universalIdentifier],
    );

    let firstStats: WschatBridgeDictionaryStats | undefined;
    let migrationCount = 0;

    for (const field of fields) {
      if (!isDefined(field) || field.type !== FieldMetadataType.SELECT) {
        throw wschatBridgeHttpException(
          HttpStatus.CONFLICT,
          WSCHAT_BRIDGE_ERROR_CODES.DATA_MODEL_MISSING,
          `The WSChat data model of this workspace has no ${dictionary} field yet; run enforce first`,
        );
      }

      const currentOptions: WschatBridgeCurrentOption[] = (
        resolveFlatFieldMetadataOptions({
          flatFieldMetadata: field,
          flatFieldMetadataOptionMaps,
        }) ?? []
      ).map((option) => ({
        id: option.id,
        value: option.value,
        label: option.label,
        color:
          'color' in option && isTagColor(option.color) ? option.color : 'gray',
        position: option.position,
        ...(option.isActive === false ? { isActive: false } : {}),
      }));

      const { options, isChanged, stats } = planBridgeDictionaryOptions({
        currentOptions,
        items,
        locale,
        placeholderValue: WSCHAT_BRIDGE_PLACEHOLDER_OPTION.value,
      });

      firstStats = firstStats ?? stats;

      if (!isChanged) {
        continue;
      }

      // Inline like the data model, so the next field's update is not refused for running deferred operations
      await retryWhileSchemaBusy(() =>
        this.fieldMetadataService.updateOneField({
          updateFieldInput: { id: field.id, options },
          workspaceId,
          shouldDeferActions: false,
        }),
      );
      migrationCount++;
    }

    this.logger.log(
      `Workspace ${workspaceId}: ${dictionary} synced, ${migrationCount} field(s) changed`,
    );

    return (
      firstStats ?? {
        added: 0,
        relabelled: 0,
        archived: 0,
        orphanOptions: 0,
        total: 0,
      }
    );
  }
}
