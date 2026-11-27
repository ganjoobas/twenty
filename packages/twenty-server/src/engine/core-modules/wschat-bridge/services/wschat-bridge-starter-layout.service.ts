import { Injectable, Logger } from '@nestjs/common';

import { isDefined, isTagColor } from 'twenty-shared/utils';

import { KeyValuePairType } from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { KeyValuePairService } from 'src/engine/core-modules/key-value-pair/key-value-pair.service';
import { type WschatBridgeLocale } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';
import {
  WSCHAT_BRIDGE_INDEX_VIEWS,
  WSCHAT_BRIDGE_SAMPLE_ACTIONS_LAYOUT_VERSION,
  WSCHAT_BRIDGE_SAMPLE_WORKFLOWS_LAYOUT_VERSION,
  WSCHAT_BRIDGE_STANDARD_OPTION_LABELS,
  WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION,
  WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION_KEY,
  WSCHAT_BRIDGE_STARTER_VIEWS,
  type WschatBridgeStandardOptionLabels,
  type WschatBridgeStarterLayoutKeyValueTypesMap,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-starter-layout.constant';
import { WschatBridgeSampleActionWorkflowsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-sample-action-workflows.service';
import { type WschatBridgeActionsTarget } from 'src/engine/core-modules/wschat-bridge/utils/build-sample-action-workflows.util';
import { WschatBridgeSampleWorkflowsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-sample-workflows.service';
import { WschatBridgeStarterIndexViewsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-starter-index-views.service';
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
  // Existing factory items changed: main views ("wschatCall.index"), sample workflows switched off ("workflow.quickLead")
  starterLayoutChanged: string[];
  // Factory items left alone because the company already changed them
  starterLayoutSkipped: string[];
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
    private readonly starterIndexViewsService: WschatBridgeStarterIndexViewsService,
    private readonly sampleWorkflowsService: WschatBridgeSampleWorkflowsService,
    private readonly sampleActionWorkflowsService: WschatBridgeSampleActionWorkflowsService,
  ) {}

  async apply({
    workspaceId,
    locale,
    actions,
  }: {
    workspaceId: string;
    locale: WschatBridgeLocale;
    actions?: WschatBridgeActionsTarget;
  }): Promise<WschatBridgeStarterLayoutResult> {
    const result: WschatBridgeStarterLayoutResult = {
      starterLayoutCreated: [],
      starterLayoutRelabelled: [],
      starterLayoutChanged: [],
      starterLayoutSkipped: [],
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
        actions,
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
    actions: WschatBridgeActionsTarget | undefined,
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

    for (const definition of WSCHAT_BRIDGE_INDEX_VIEWS.filter(
      ({ version }) => version > appliedVersion,
    )) {
      try {
        const outcome = await retryWhileSchemaBusy(() =>
          this.starterIndexViewsService.apply({
            workspaceId,
            definition,
            locale,
          }),
        );

        if (outcome === 'changed') {
          result.starterLayoutChanged.push(definition.reportName);
        } else if (outcome === 'skipped') {
          result.starterLayoutSkipped.push(definition.reportName);
        }
      } catch (error) {
        isComplete = false;
        result.starterLayoutFailed.push(
          `${definition.reportName}: ${describeError(error)}`,
        );
      }
    }

    if (appliedVersion < WSCHAT_BRIDGE_SAMPLE_WORKFLOWS_LAYOUT_VERSION) {
      try {
        const workflows =
          await this.sampleWorkflowsService.deactivateFactoryWorkflows(
            workspaceId,
          );

        result.starterLayoutChanged.push(...workflows.deactivated);
        result.starterLayoutSkipped.push(...workflows.skipped);
      } catch (error) {
        isComplete = false;
        result.starterLayoutFailed.push(`workflows: ${describeError(error)}`);
      }
    }

    if (appliedVersion < WSCHAT_BRIDGE_SAMPLE_ACTIONS_LAYOUT_VERSION) {
      if (actions === undefined) {
        // Pending, not failed: the next call that brings `actions` creates them
        isComplete = false;
      } else {
        try {
          result.starterLayoutCreated.push(
            ...(await this.sampleActionWorkflowsService.createSamples({
              workspaceId,
              target: actions,
              locale,
            })),
          );
        } catch (error) {
          isComplete = false;
          result.starterLayoutFailed.push(
            `action samples: ${describeError(error)}`,
          );
        }
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
