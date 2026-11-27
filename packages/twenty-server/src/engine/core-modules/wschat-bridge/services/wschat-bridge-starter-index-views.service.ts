import { Injectable } from '@nestjs/common';

import { ViewKey } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import {
  WSCHAT_BRIDGE_OBJECTS,
  type WschatBridgeLocale,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';
import {
  WSCHAT_BRIDGE_INITIAL_VIEW_FIELD_NAMES,
  type WschatBridgeIndexViewDefinition,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-starter-layout.constant';
import {
  isIndexViewUntouched,
  isInitialViewUntouched,
  planIndexViewAppend,
  planIndexViewReshape,
  type WschatBridgeIndexViewField,
} from 'src/engine/core-modules/wschat-bridge/utils/plan-index-view-columns.util';
import { fromCreateViewFieldInputToFlatViewFieldToCreate } from 'src/engine/metadata-modules/flat-view-field/utils/from-create-view-field-input-to-flat-view-field-to-create.util';
import { fromUpdateViewFieldInputToFlatViewFieldToUpdateOrThrow } from 'src/engine/metadata-modules/flat-view-field/utils/from-update-view-field-input-to-flat-view-field-to-update-or-throw.util';
import { fromUpdateViewInputToFlatViewToUpdateOrThrow } from 'src/engine/metadata-modules/flat-view/utils/from-update-view-input-to-flat-view-to-update-or-throw.util';
import { getInitialObjectViewUniversalIdentifier } from 'src/engine/metadata-modules/view/utils/get-initial-object-view-universal-identifier.util';
import { INDEX_VIEW_NAME } from 'src/engine/metadata-modules/view/constants/index-view-name.constant';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const VIEW_FIELD_SIZE = 180;

// skipped: the company already changed the main view, so it is left as it is
export type WschatBridgeIndexViewOutcome = 'changed' | 'unchanged' | 'skipped';

const hasOverrides = (overrides: unknown): boolean =>
  isDefined(overrides) &&
  (typeof overrides !== 'object' || Object.keys(overrides).length > 0);

// The main view of an object, edited through upstream's own view and view-field utils in one
// workspace migration; columns are only added, moved or hidden, never deleted
@Injectable()
export class WschatBridgeStarterIndexViewsService {
  constructor(
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
  ) {}

  async apply({
    workspaceId,
    definition,
    locale,
  }: {
    workspaceId: string;
    definition: WschatBridgeIndexViewDefinition;
    locale: WschatBridgeLocale;
  }): Promise<WschatBridgeIndexViewOutcome> {
    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );
    const maps = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
      'flatFieldMetadataOptionMaps',
      'flatViewMaps',
      'flatViewGroupMaps',
      'flatViewFieldMaps',
      'flatViewFieldGroupMaps',
    ]);

    const flatObjectMetadata =
      maps.flatObjectMetadataMaps.byUniversalIdentifier[
        definition.objectUniversalIdentifier
      ];
    const initialViewUniversalIdentifier =
      getInitialObjectViewUniversalIdentifier({
        viewApplicationUniversalIdentifier:
          workspaceCustomFlatApplication.universalIdentifier,
        objectUniversalIdentifier: definition.objectUniversalIdentifier,
      });
    const flatView = Object.values(
      maps.flatViewMaps.byUniversalIdentifier,
    ).find(
      (candidate) =>
        isDefined(candidate) &&
        candidate.objectMetadataId === flatObjectMetadata?.id &&
        (definition.view === 'initial'
          ? candidate.universalIdentifier === initialViewUniversalIdentifier
          : candidate.key === ViewKey.INDEX) &&
        !isDefined(candidate.deletedAt),
    );

    if (!isDefined(flatObjectMetadata) || !isDefined(flatView)) {
      throw new Error(`${definition.reportName}: main view not found`);
    }

    const fieldNameById = new Map(
      Object.values(maps.flatFieldMetadataMaps.byUniversalIdentifier)
        .filter(isDefined)
        .filter(
          ({ objectMetadataId }) => objectMetadataId === flatObjectMetadata.id,
        )
        .map(({ id, name }) => [id, name]),
    );
    const fieldIdByName = new Map(
      [...fieldNameById].map(([id, name]) => [name, id]),
    );

    const viewFields: WschatBridgeIndexViewField[] = Object.values(
      maps.flatViewFieldMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
        (viewField) =>
          viewField.viewId === flatView.id && !isDefined(viewField.deletedAt),
      )
      .map((viewField) => ({
        id: viewField.id,
        fieldName: fieldNameById.get(viewField.fieldMetadataId) ?? '',
        position: viewField.position,
        isVisible: viewField.isVisible,
        isSystemSideEffect: viewField.isSystemSideEffect,
        hasOverrides: hasOverrides(viewField.overrides),
      }));

    const isReshape = definition.mode === 'reshape';
    const targetNames = Object.values(definition.name ?? {});

    // Already ours (a repeated run): nothing to do
    if (isReshape && targetNames.includes(flatView.name)) {
      return 'unchanged';
    }

    if (
      isReshape &&
      !this.isUntouched({
        definition,
        flatView,
        viewFields,
        objectLabelPlurals: [
          flatObjectMetadata.labelPlural,
          ...this.shippedLabelPlurals(definition.objectUniversalIdentifier),
        ],
      })
    ) {
      return 'skipped';
    }

    const missingFieldName = definition.fieldNames.find(
      (fieldName) => !fieldIdByName.has(fieldName),
    );

    if (isDefined(missingFieldName)) {
      throw new Error(
        `${definition.reportName}: field ${missingFieldName} not found`,
      );
    }

    const plan = isReshape
      ? planIndexViewReshape({ viewFields, fieldNames: definition.fieldNames })
      : planIndexViewAppend({ viewFields, fieldNames: definition.fieldNames });
    const newName = isReshape ? definition.name?.[locale] : undefined;

    if (
      plan.toCreate.length === 0 &&
      plan.toUpdate.length === 0 &&
      !isDefined(newName)
    ) {
      return 'unchanged';
    }

    const applicationUniversalIdentifier =
      workspaceCustomFlatApplication.universalIdentifier;

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          allFlatEntityOperationByMetadataName: {
            ...(isDefined(newName)
              ? {
                  view: {
                    flatEntityToCreate: [],
                    flatEntityToDelete: [],
                    flatEntityToUpdate: [
                      fromUpdateViewInputToFlatViewToUpdateOrThrow({
                        updateViewInput: {
                          id: flatView.id,
                          name: newName,
                          ...(isDefined(definition.position)
                            ? { position: definition.position }
                            : {}),
                        },
                        flatViewMaps: maps.flatViewMaps,
                        flatViewGroupMaps: maps.flatViewGroupMaps,
                        flatFieldMetadataMaps: maps.flatFieldMetadataMaps,
                        flatFieldMetadataOptionMaps:
                          maps.flatFieldMetadataOptionMaps,
                        callerApplicationUniversalIdentifier:
                          applicationUniversalIdentifier,
                        workspaceCustomApplicationUniversalIdentifier:
                          applicationUniversalIdentifier,
                      }).flatViewToUpdate,
                    ],
                  },
                }
              : {}),
            viewField: {
              flatEntityToCreate: plan.toCreate.map(({ fieldName, position }) =>
                fromCreateViewFieldInputToFlatViewFieldToCreate({
                  createViewFieldInput: {
                    viewId: flatView.id,
                    fieldMetadataId: fieldIdByName.get(fieldName) ?? '',
                    isVisible: true,
                    size: VIEW_FIELD_SIZE,
                    position,
                  },
                  flatApplication: workspaceCustomFlatApplication,
                  flatFieldMetadataMaps: maps.flatFieldMetadataMaps,
                  flatViewMaps: maps.flatViewMaps,
                  flatViewFieldGroupMaps: maps.flatViewFieldGroupMaps,
                }),
              ),
              flatEntityToDelete: [],
              flatEntityToUpdate: plan.toUpdate.map(
                ({ id, position, isVisible }) =>
                  fromUpdateViewFieldInputToFlatViewFieldToUpdateOrThrow({
                    updateViewFieldInput: {
                      id,
                      update: { position, isVisible },
                    },
                    flatViewFieldMaps: maps.flatViewFieldMaps,
                    flatViewFieldGroupMaps: maps.flatViewFieldGroupMaps,
                    flatFieldMetadataMaps: maps.flatFieldMetadataMaps,
                    callerApplicationUniversalIdentifier:
                      applicationUniversalIdentifier,
                    workspaceCustomApplicationUniversalIdentifier:
                      applicationUniversalIdentifier,
                  }),
              ),
            },
          },
          workspaceId,
          isSystemBuild: false,
          applicationUniversalIdentifier,
        },
      );

    if (result.status === 'fail') {
      throw new WorkspaceMigrationBuilderException(
        result,
        `${definition.reportName}: changing the main view failed`,
      );
    }

    return 'changed';
  }

  private isUntouched({
    definition,
    flatView,
    viewFields,
    objectLabelPlurals,
  }: {
    definition: WschatBridgeIndexViewDefinition;
    flatView: { name: string; overrides?: unknown };
    viewFields: WschatBridgeIndexViewField[];
    objectLabelPlurals: string[];
  }): boolean {
    return definition.view === 'initial'
      ? isInitialViewUntouched({
          viewName: flatView.name,
          shippedViewNames: objectLabelPlurals.map((label) => `All ${label}`),
          viewFields,
          shippedFieldNames: WSCHAT_BRIDGE_INITIAL_VIEW_FIELD_NAMES,
        })
      : isIndexViewUntouched({
          viewName: flatView.name,
          shippedViewName: INDEX_VIEW_NAME,
          viewHasOverrides: hasOverrides(flatView.overrides),
          viewFields,
        });
  }

  // The initial view's name was materialised from the label at object creation, in either of our locales
  private shippedLabelPlurals(objectUniversalIdentifier: string): string[] {
    const definition = WSCHAT_BRIDGE_OBJECTS.find(
      (object) => object.universalIdentifier === objectUniversalIdentifier,
    );

    return isDefined(definition) ? Object.values(definition.labelPlural) : [];
  }
}
