import { Injectable, Logger } from '@nestjs/common';

import { isDefined, isTagColor } from 'twenty-shared/utils';

import { KeyValuePairType } from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { KeyValuePairService } from 'src/engine/core-modules/key-value-pair/key-value-pair.service';
import { type WschatBridgeLocale } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';
import {
  WSCHAT_BRIDGE_STANDARD_OPTION_LABELS,
  WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION,
  WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION_KEY,
  WSCHAT_BRIDGE_STARTER_VIEWS,
  type WschatBridgeStandardOptionLabels,
  type WschatBridgeStarterLayoutKeyValueTypesMap,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-starter-layout.constant';
import { WschatBridgeStarterViewsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-starter-views.service';
import { planStandardOptionRelabels } from 'src/engine/core-modules/wschat-bridge/utils/plan-standard-option-relabels.util';
import { retryWhileSchemaBusy } from 'src/engine/core-modules/wschat-bridge/utils/schema-busy-retry.util';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { resolveFlatFieldMetadataOptions } from 'src/engine/metadata-modules/flat-field-metadata-option/utils/resolve-flat-field-metadata-options.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

export type WschatBridgeStarterLayoutResult = {
  // Starter views created by this call ("task.byType")
  starterLayoutCreated: string[];
  // Standard option lists whose shipped English labels were translated ("task.status")
  starterLayoutRelabelled: string[];
  // Steps that failed, with a short reason; the next call tries them again
  starterLayoutFailed: string[];
  // Highest layout version applied to this workspace
  starterLayoutVersion: number;
};

const VERSION_ROW = {
  type: KeyValuePairType.CONFIG_VARIABLE,
  userId: null,
  key: WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION_KEY,
} as const;

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// How a new workspace first looks (README, "Starter layout"). Views come once per layout version,
// so a company may delete or change them; labels are translated every time they still read as shipped.
// Never throws: a failure is reported and retried by the next call.
@Injectable()
export class WschatBridgeStarterLayoutService {
  private readonly logger = new Logger(WschatBridgeStarterLayoutService.name);

  constructor(
    private readonly keyValuePairService: KeyValuePairService<WschatBridgeStarterLayoutKeyValueTypesMap>,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly fieldMetadataService: FieldMetadataService,
    private readonly starterViewsService: WschatBridgeStarterViewsService,
  ) {}

  async apply({
    workspaceId,
    locale,
  }: {
    workspaceId: string;
    locale: WschatBridgeLocale;
  }): Promise<WschatBridgeStarterLayoutResult> {
    const result: WschatBridgeStarterLayoutResult = {
      starterLayoutCreated: [],
      starterLayoutRelabelled: [],
      starterLayoutFailed: [],
      starterLayoutVersion: 0,
    };

    for (const definition of WSCHAT_BRIDGE_STANDARD_OPTION_LABELS) {
      try {
        if (await this.relabel(workspaceId, definition, locale)) {
          result.starterLayoutRelabelled.push(definition.reportName);
        }
      } catch (error) {
        result.starterLayoutFailed.push(
          `${definition.reportName}: ${describeError(error)}`,
        );
      }
    }

    try {
      result.starterLayoutVersion = await this.applyViews(
        workspaceId,
        locale,
        result,
      );
    } catch (error) {
      result.starterLayoutFailed.push(`views: ${describeError(error)}`);
    }

    if (result.starterLayoutFailed.length > 0) {
      this.logger.warn(
        `Workspace ${workspaceId}: starter layout incomplete: ${result.starterLayoutFailed.join('; ')}`,
      );
    }

    return result;
  }

  private async applyViews(
    workspaceId: string,
    locale: WschatBridgeLocale,
    result: WschatBridgeStarterLayoutResult,
  ): Promise<number> {
    const [stored] = await this.keyValuePairService.get({
      ...VERSION_ROW,
      workspaceId,
    });
    const appliedVersion = typeof stored?.value === 'number' ? stored.value : 0;

    if (appliedVersion >= WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION) {
      return appliedVersion;
    }

    let isComplete = true;

    for (const definition of WSCHAT_BRIDGE_STARTER_VIEWS.filter(
      ({ version }) => version > appliedVersion,
    )) {
      try {
        if (
          await retryWhileSchemaBusy(() =>
            this.starterViewsService.createIfMissing({
              workspaceId,
              definition,
              locale,
            }),
          )
        ) {
          result.starterLayoutCreated.push(definition.reportName);
        }
      } catch (error) {
        isComplete = false;
        result.starterLayoutFailed.push(
          `${definition.reportName}: ${describeError(error)}`,
        );
      }
    }

    if (!isComplete) {
      return appliedVersion;
    }

    await this.keyValuePairService.set({
      ...VERSION_ROW,
      workspaceId,
      value: WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION,
    });

    return WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION;
  }

  // Written as a workspace override of the standard option, so upstream's base label stays as shipped
  private async relabel(
    workspaceId: string,
    definition: WschatBridgeStandardOptionLabels,
    locale: WschatBridgeLocale,
  ): Promise<boolean> {
    const { flatFieldMetadataMaps, flatFieldMetadataOptionMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatFieldMetadataMaps',
        'flatFieldMetadataOptionMaps',
      ]);
    const field =
      flatFieldMetadataMaps.byUniversalIdentifier[
        definition.fieldUniversalIdentifier
      ];

    if (!isDefined(field)) {
      return false;
    }

    const options = planStandardOptionRelabels({
      currentOptions: (
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
      })),
      definition,
      locale,
    });

    if (!isDefined(options)) {
      return false;
    }

    await retryWhileSchemaBusy(() =>
      this.fieldMetadataService.updateOneField({
        updateFieldInput: { id: field.id, options },
        workspaceId,
        shouldDeferActions: false,
      }),
    );

    return true;
  }
}
