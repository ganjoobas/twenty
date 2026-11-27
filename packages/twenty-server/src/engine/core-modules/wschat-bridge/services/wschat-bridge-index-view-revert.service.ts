import { Injectable } from '@nestjs/common';

import { ViewKey } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { type WschatBridgeIndexViewDefinition } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-starter-layout.constant';
import { type WschatBridgeIndexViewOutcome } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-starter-index-views.service';
import { planIndexViewRevert } from 'src/engine/core-modules/wschat-bridge/utils/plan-index-view-revert.util';
import { fromDestroyViewFieldInputToFlatViewFieldOrThrow } from 'src/engine/metadata-modules/flat-view-field/utils/from-destroy-view-field-input-to-flat-view-field-or-throw.util';
import { fromUpdateViewFieldInputToFlatViewFieldToUpdateOrThrow } from 'src/engine/metadata-modules/flat-view-field/utils/from-update-view-field-input-to-flat-view-field-to-update-or-throw.util';
import { fromUpdateViewInputToFlatViewToUpdateOrThrow } from 'src/engine/metadata-modules/flat-view/utils/from-update-view-input-to-flat-view-to-update-or-throw.util';
import { resolveEffectiveFlatEntity } from 'src/engine/metadata-modules/overrides/utils/resolve-effective-flat-entity.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const hasOverrides = (overrides: unknown): boolean =>
  isDefined(overrides) &&
  (typeof overrides !== 'object' || Object.keys(overrides).length > 0);

// Version 2 renamed and reshaped the INDEX views of conversations and calls through overrides; the app opens
// the initial view instead, so version 5 puts INDEX back as upstream made it (README, "Main views")
@Injectable()
export class WschatBridgeIndexViewRevertService {
  constructor(
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
  ) {}

  // `definition` is the version 5 one: same names and columns as version 2 used
  async revert({
    workspaceId,
    definition,
  }: {
    workspaceId: string;
    definition: WschatBridgeIndexViewDefinition;
  }): Promise<WschatBridgeIndexViewOutcome> {
    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );
    const applicationUniversalIdentifier =
      workspaceCustomFlatApplication.universalIdentifier;
    const maps = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
      'flatFieldMetadataOptionMaps',
      'flatViewMaps',
      'flatViewGroupMaps',
      'flatViewFieldMaps',
      'flatViewFieldGroupMaps',
    ]);
    const authorContext = {
      workspaceCustomApplicationUniversalIdentifier:
        applicationUniversalIdentifier,
    };

    const flatObjectMetadata =
      maps.flatObjectMetadataMaps.byUniversalIdentifier[
        definition.objectUniversalIdentifier
      ];
    const flatView = Object.values(
      maps.flatViewMaps.byUniversalIdentifier,
    ).find(
      (candidate) =>
        isDefined(candidate) &&
        candidate.objectMetadataId === flatObjectMetadata?.id &&
        candidate.key === ViewKey.INDEX &&
        !isDefined(candidate.deletedAt),
    );

    if (!isDefined(flatView)) {
      return 'unchanged';
    }

    const fieldNameById = new Map(
      Object.values(maps.flatFieldMetadataMaps.byUniversalIdentifier)
        .filter(isDefined)
        .map(({ id, name }) => [id, name]),
    );
    const flatViewFields = Object.values(
      maps.flatViewFieldMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
        (viewField) =>
          viewField.viewId === flatView.id && !isDefined(viewField.deletedAt),
      );

    const plan = planIndexViewRevert({
      effectiveViewName: resolveEffectiveFlatEntity({
        metadataName: 'view',
        flatEntity: flatView,
        authorContext,
      }).name,
      baseViewName: flatView.name,
      ourViewNames: Object.values(definition.name ?? {}),
      ourFieldNames: definition.fieldNames,
      viewFields: flatViewFields.map((viewField) => ({
        id: viewField.id,
        fieldName: fieldNameById.get(viewField.fieldMetadataId) ?? '',
        isSystemSideEffect: viewField.isSystemSideEffect,
        hasOverrides: hasOverrides(viewField.overrides),
        basePosition: viewField.position,
        baseIsVisible: viewField.isVisible,
        effectiveIsVisible: resolveEffectiveFlatEntity({
          metadataName: 'viewField',
          flatEntity: viewField,
          authorContext,
        }).isVisible,
      })),
    });

    if (plan.kind !== 'revert') {
      return plan.kind;
    }

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          allFlatEntityOperationByMetadataName: {
            // The base name again: an update equal to the value beneath drops the override
            view: {
              flatEntityToCreate: [],
              flatEntityToDelete: [],
              flatEntityToUpdate: [
                fromUpdateViewInputToFlatViewToUpdateOrThrow({
                  updateViewInput: { id: flatView.id, name: flatView.name },
                  flatViewMaps: maps.flatViewMaps,
                  flatViewGroupMaps: maps.flatViewGroupMaps,
                  flatFieldMetadataMaps: maps.flatFieldMetadataMaps,
                  flatFieldMetadataOptionMaps: maps.flatFieldMetadataOptionMaps,
                  callerApplicationUniversalIdentifier:
                    applicationUniversalIdentifier,
                  workspaceCustomApplicationUniversalIdentifier:
                    applicationUniversalIdentifier,
                }).flatViewToUpdate,
              ],
            },
            viewField: {
              flatEntityToCreate: [],
              flatEntityToDelete: plan.toDelete.map((id) =>
                fromDestroyViewFieldInputToFlatViewFieldOrThrow({
                  destroyViewFieldInput: { id },
                  flatViewFieldMaps: maps.flatViewFieldMaps,
                }),
              ),
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
        `${definition.reportName}: putting the INDEX view back failed`,
      );
    }

    return 'changed';
  }
}
