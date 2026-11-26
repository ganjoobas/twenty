import { Injectable } from '@nestjs/common';

import { ViewVisibility } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import {
  WSCHAT_BRIDGE_PLACEHOLDER_OPTION,
  type WschatBridgeLocale,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';
import {
  WSCHAT_BRIDGE_STARTER_VIEWS,
  type WschatBridgeStarterViewDefinition,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-starter-layout.constant';
import { orderStarterBoardViewGroups } from 'src/engine/core-modules/wschat-bridge/utils/order-starter-board-view-groups.util';
import { findManyFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-many-flat-entity-by-id-in-flat-entity-maps.util';
import { resolveFlatFieldMetadataOptions } from 'src/engine/metadata-modules/flat-field-metadata-option/utils/resolve-flat-field-metadata-options.util';
import { fromUpdateViewGroupInputToFlatViewGroupToUpdateOrThrow } from 'src/engine/metadata-modules/flat-view-group/utils/from-update-view-group-input-to-flat-view-group-to-update-or-throw.util';
import { buildCompleteViewChildrenFlatOperations } from 'src/engine/metadata-modules/flat-view/utils/build-complete-view-children-flat-operations.util';
import { fromCreateViewInputToFlatViewToCreate } from 'src/engine/metadata-modules/flat-view/utils/from-create-view-input-to-flat-view-to-create.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const VIEW_FIELD_SIZE = 180;

const VIEW_MAPS_KEYS = [
  'flatObjectMetadataMaps',
  'flatFieldMetadataMaps',
  'flatFieldMetadataOptionMaps',
  'flatViewMaps',
  'flatViewGroupMaps',
  'flatViewFieldMaps',
  'flatViewFilterMaps',
  'flatViewSortMaps',
  'flatViewFieldGroupMaps',
  'flatViewFilterGroupMaps',
] as const;

// Our starter views, built with upstream's own view utils and run as one workspace migration each,
// like the AI tool's CompleteViewUpsertService (which cannot set a position or a universal identifier)
@Injectable()
export class WschatBridgeStarterViewsService {
  constructor(
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
  ) {}

  // false: a view with this universal identifier exists already (a run that stopped part-way)
  async createIfMissing({
    workspaceId,
    definition,
    locale,
  }: {
    workspaceId: string;
    definition: WschatBridgeStarterViewDefinition;
    locale: WschatBridgeLocale;
  }): Promise<boolean> {
    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );
    const maps = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      ...VIEW_MAPS_KEYS,
    ]);

    if (
      isDefined(
        maps.flatViewMaps.byUniversalIdentifier[definition.universalIdentifier],
      )
    ) {
      return false;
    }

    const flatObjectMetadata =
      maps.flatObjectMetadataMaps.byUniversalIdentifier[
        definition.objectUniversalIdentifier
      ];

    if (!isDefined(flatObjectMetadata)) {
      throw new Error(`${definition.reportName}: object not found`);
    }

    const fieldIdOf = (fieldName: string): string => {
      const flatFieldMetadata = Object.values(
        maps.flatFieldMetadataMaps.byUniversalIdentifier,
      ).find(
        (candidate) =>
          candidate?.objectMetadataId === flatObjectMetadata.id &&
          candidate.name === fieldName &&
          candidate.isActive,
      );

      if (!isDefined(flatFieldMetadata)) {
        throw new Error(
          `${definition.reportName}: field ${fieldName} not found`,
        );
      }

      return flatFieldMetadata.id;
    };

    const { flatViewToCreate, flatViewGroupsToCreate } =
      fromCreateViewInputToFlatViewToCreate({
        createViewInput: {
          universalIdentifier: definition.universalIdentifier,
          name: definition.name[locale],
          objectMetadataId: flatObjectMetadata.id,
          icon: definition.icon,
          type: definition.type,
          position: definition.position,
          visibility: ViewVisibility.WORKSPACE,
          ...(isDefined(definition.groupByFieldName)
            ? {
                mainGroupByFieldMetadataId: fieldIdOf(
                  definition.groupByFieldName,
                ),
              }
            : {}),
        },
        flatApplication: workspaceCustomFlatApplication,
        flatFieldMetadataMaps: maps.flatFieldMetadataMaps,
        flatFieldMetadataOptionMaps: maps.flatFieldMetadataOptionMaps,
        flatObjectMetadataMaps: maps.flatObjectMetadataMaps,
      });

    const children = buildCompleteViewChildrenFlatOperations({
      viewId: flatViewToCreate.id,
      flatApplication: workspaceCustomFlatApplication,
      flatFieldMetadataMaps: maps.flatFieldMetadataMaps,
      // The children resolve the view through this map before the view exists
      flatViewMaps: {
        ...maps.flatViewMaps,
        universalIdentifierById: {
          ...maps.flatViewMaps.universalIdentifierById,
          [flatViewToCreate.id]: flatViewToCreate.universalIdentifier,
        },
      },
      flatViewFieldMaps: maps.flatViewFieldMaps,
      flatViewFilterMaps: maps.flatViewFilterMaps,
      flatViewSortMaps: maps.flatViewSortMaps,
      flatViewFieldGroupMaps: maps.flatViewFieldGroupMaps,
      flatViewFilterGroupMaps: maps.flatViewFilterGroupMaps,
      fields: definition.fieldNames.map((fieldName) => ({
        fieldMetadataId: fieldIdOf(fieldName),
        isVisible: true,
        size: VIEW_FIELD_SIZE,
      })),
      ...(isDefined(definition.filter)
        ? {
            filters: [
              {
                fieldMetadataId: fieldIdOf(definition.filter.fieldName),
                operand: definition.filter.operand,
                // A SELECT filter is stored as a JSON list of values, as the front writes it
                value: JSON.stringify(definition.filter.values),
              },
            ],
          }
        : {}),
      ...(isDefined(definition.sort)
        ? {
            sorts: [
              {
                fieldMetadataId: fieldIdOf(definition.sort.fieldName),
                direction: definition.sort.direction,
              },
            ],
          }
        : {}),
    });

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          allFlatEntityOperationByMetadataName: {
            view: {
              flatEntityToCreate: [flatViewToCreate],
              flatEntityToDelete: [],
              flatEntityToUpdate: [],
            },
            // Upstream makes one column per option; nobody ever holds the placeholder, so its column is hidden
            viewGroup: {
              flatEntityToCreate: flatViewGroupsToCreate.map((viewGroup) =>
                viewGroup.fieldValue === WSCHAT_BRIDGE_PLACEHOLDER_OPTION.value
                  ? { ...viewGroup, isVisible: false }
                  : viewGroup,
              ),
              flatEntityToDelete: [],
              flatEntityToUpdate: [],
            },
            ...children,
          },
          workspaceId,
          isSystemBuild: false,
          applicationUniversalIdentifier:
            workspaceCustomFlatApplication.universalIdentifier,
        },
      );

    if (result.status === 'fail') {
      throw new WorkspaceMigrationBuilderException(
        result,
        `${definition.reportName}: creating the starter view failed`,
      );
    }

    return true;
  }

  // After a dictionary changed the options of the field: our boards grouped by it get new columns
  // before the placeholder and "no value" (README, "Starter layout"); a board regrouped by the company is left alone
  async alignBoardsAfterOptionsChange({
    workspaceId,
    fieldUniversalIdentifier,
    previousOptionValues,
  }: {
    workspaceId: string;
    fieldUniversalIdentifier: string;
    previousOptionValues: string[];
  }): Promise<number> {
    const maps = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatFieldMetadataMaps',
      'flatFieldMetadataOptionMaps',
      'flatViewMaps',
      'flatViewGroupMaps',
    ]);
    const flatFieldMetadata =
      maps.flatFieldMetadataMaps.byUniversalIdentifier[
        fieldUniversalIdentifier
      ];

    if (!isDefined(flatFieldMetadata)) {
      return 0;
    }

    const optionValues = (
      resolveFlatFieldMetadataOptions({
        flatFieldMetadata,
        flatFieldMetadataOptionMaps: maps.flatFieldMetadataOptionMaps,
      }) ?? []
    ).map(({ value }) => value);

    const changedViewGroups = WSCHAT_BRIDGE_STARTER_VIEWS.flatMap(
      ({ universalIdentifier }) => {
        const flatView =
          maps.flatViewMaps.byUniversalIdentifier[universalIdentifier];

        if (
          !isDefined(flatView) ||
          isDefined(flatView.deletedAt) ||
          flatView.mainGroupByFieldMetadataId !== flatFieldMetadata.id
        ) {
          return [];
        }

        return orderStarterBoardViewGroups({
          viewGroups: findManyFlatEntityByIdInFlatEntityMaps({
            flatEntityIds: flatView.viewGroupIds,
            flatEntityMaps: maps.flatViewGroupMaps,
          }).filter((viewGroup) => !isDefined(viewGroup.deletedAt)),
          optionValues,
          previousOptionValues,
          placeholderValue: WSCHAT_BRIDGE_PLACEHOLDER_OPTION.value,
        });
      },
    );

    if (changedViewGroups.length === 0) {
      return 0;
    }

    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          allFlatEntityOperationByMetadataName: {
            viewGroup: {
              flatEntityToCreate: [],
              flatEntityToDelete: [],
              flatEntityToUpdate: changedViewGroups.map(
                ({ id, position, isVisible }) =>
                  fromUpdateViewGroupInputToFlatViewGroupToUpdateOrThrow({
                    flatViewGroupMaps: maps.flatViewGroupMaps,
                    updateViewGroupInput: {
                      id,
                      update: { position, isVisible },
                    },
                  }),
              ),
            },
          },
          workspaceId,
          isSystemBuild: false,
          applicationUniversalIdentifier:
            workspaceCustomFlatApplication.universalIdentifier,
        },
      );

    if (result.status === 'fail') {
      throw new WorkspaceMigrationBuilderException(
        result,
        'Aligning the starter board columns failed',
      );
    }

    return changedViewGroups.length;
  }
}
