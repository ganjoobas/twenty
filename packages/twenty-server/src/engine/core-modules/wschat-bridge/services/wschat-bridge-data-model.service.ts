import { Injectable, Logger } from '@nestjs/common';

import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import {
  WSCHAT_BRIDGE_FIELDS,
  WSCHAT_BRIDGE_OBJECTS,
  type WschatBridgeLocale,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';
import {
  planBridgeFields,
  planBridgeObjects,
  type WschatBridgeExistingField,
  type WschatBridgeExistingObject,
  type WschatBridgeFieldsPlan,
} from 'src/engine/core-modules/wschat-bridge/utils/plan-bridge-data-model.util';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

export type WschatBridgeDataModelResult = {
  dataModelCreated: string[];
  dataModelRepaired: string[];
  dataModelConflicts: string[];
};

type CurrentMetadata = {
  existingObjects: WschatBridgeExistingObject[];
  existingFields: WschatBridgeExistingField[];
};

// Objects and fields WSChat writes through the records API; only the bridge can add them (DATA_MODEL).
// Every write follows a fresh plan of what is missing, so a run that failed part-way is finished by the next one
@Injectable()
export class WschatBridgeDataModelService {
  private readonly logger = new Logger(WschatBridgeDataModelService.name);

  constructor(
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly objectMetadataService: ObjectMetadataService,
    private readonly fieldMetadataService: FieldMetadataService,
    private readonly applicationService: ApplicationService,
  ) {}

  // locale given: labels follow it; absent: labels are left alone and new items get English ones
  async ensure({
    workspaceId,
    locale,
  }: {
    workspaceId: string;
    locale?: WschatBridgeLocale;
  }): Promise<WschatBridgeDataModelResult> {
    const labelLocale = locale ?? 'en';
    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );

    const objectsPlan = planBridgeObjects({
      definitions: WSCHAT_BRIDGE_OBJECTS,
      existingObjects: (await this.loadCurrentMetadata(workspaceId))
        .existingObjects,
      locale,
    });

    // One workspace migration per object (createOneObject also adds its view and navigation item)
    for (const definition of objectsPlan.toCreate) {
      await this.objectMetadataService.createOneObject({
        createObjectInput: {
          universalIdentifier: definition.universalIdentifier,
          nameSingular: definition.nameSingular,
          namePlural: definition.namePlural,
          labelSingular: definition.labelSingular[labelLocale],
          labelPlural: definition.labelPlural[labelLocale],
          description: definition.description,
          icon: definition.icon,
          isLabelSyncedWithName: false,
        },
        workspaceId,
        ownerFlatApplication: workspaceCustomFlatApplication,
      });
    }

    await this.objectMetadataService.updateManyObjects({
      updateObjectInputs: objectsPlan.toUpdate.map(({ id, update }) => ({
        id,
        update,
      })),
      workspaceId,
    });

    const createdFieldNames = await this.createMissingFields({
      workspaceId,
      locale,
      labelLocale,
      ownerFlatApplication: workspaceCustomFlatApplication,
    });

    // Planned again after creation: reverse lists only exist now and get their translated labels here
    const fieldsPlan = await this.planFields(workspaceId, locale);

    for (const { id, update } of fieldsPlan.toUpdate) {
      await this.fieldMetadataService.updateOneField({
        updateFieldInput: { id, ...update },
        workspaceId,
      });
    }

    const result: WschatBridgeDataModelResult = {
      dataModelCreated: [
        ...objectsPlan.toCreate.map(({ nameSingular }) => nameSingular),
        ...createdFieldNames,
      ],
      dataModelRepaired: [
        ...objectsPlan.toUpdate.map(({ nameSingular }) => nameSingular),
        ...fieldsPlan.toUpdate.map(({ reportName }) => reportName),
      ],
      dataModelConflicts: [...objectsPlan.conflicts, ...fieldsPlan.conflicts],
    };

    if (result.dataModelConflicts.length > 0) {
      this.logger.warn(
        `Workspace ${workspaceId}: data model left untouched (not ours or another shape): ${result.dataModelConflicts.join(', ')}`,
      );
    }

    return result;
  }

  // All missing fields of every object in ONE workspace migration
  private async createMissingFields({
    workspaceId,
    locale,
    labelLocale,
    ownerFlatApplication,
  }: {
    workspaceId: string;
    locale?: WschatBridgeLocale;
    labelLocale: WschatBridgeLocale;
    ownerFlatApplication: FlatApplication;
  }): Promise<string[]> {
    const plan = await this.planFields(workspaceId, locale);

    if (plan.toCreate.length === 0) {
      return [];
    }

    await this.fieldMetadataService.createManyFields({
      createFieldInputs: plan.toCreate.map(
        ({ definition, objectMetadataId, relationTargetObjectMetadataId }) => ({
          objectMetadataId,
          universalIdentifier: definition.universalIdentifier,
          type: definition.type,
          name: definition.name,
          label: definition.label[labelLocale],
          icon: definition.icon,
          isNullable: true,
          isUIEditable: false,
          isLabelSyncedWithName: false,
          ...(definition.type === FieldMetadataType.RELATION
            ? {}
            : { isUnique: definition.isUnique }),
          ...(isDefined(definition.relation) &&
          isDefined(relationTargetObjectMetadataId)
            ? {
                relationCreationPayload: {
                  type: RelationType.MANY_TO_ONE,
                  targetObjectMetadataId: relationTargetObjectMetadataId,
                  // English so the reverse list's computed name is the same in every workspace
                  targetFieldLabel: definition.relation.reverseLabel.en,
                  targetFieldIcon: definition.relation.reverseIcon,
                },
              }
            : {}),
        }),
      ),
      workspaceId,
      ownerFlatApplication,
    });

    return plan.toCreate.map(({ reportName }) => reportName);
  }

  private async planFields(
    workspaceId: string,
    locale?: WschatBridgeLocale,
  ): Promise<WschatBridgeFieldsPlan> {
    const { existingObjects, existingFields } =
      await this.loadCurrentMetadata(workspaceId);

    const neededObjectUniversalIdentifiers = new Set(
      WSCHAT_BRIDGE_FIELDS.flatMap(
        ({ objectUniversalIdentifier, relation }) => [
          objectUniversalIdentifier,
          ...(isDefined(relation)
            ? [relation.targetObjectUniversalIdentifier]
            : []),
        ],
      ),
    );
    const neededObjects = existingObjects.filter(
      ({ universalIdentifier, isActive }) =>
        isActive && neededObjectUniversalIdentifiers.has(universalIdentifier),
    );

    return planBridgeFields({
      definitions: WSCHAT_BRIDGE_FIELDS,
      objectIdByUniversalIdentifier: Object.fromEntries(
        neededObjects.map(({ universalIdentifier, id }) => [
          universalIdentifier,
          id,
        ]),
      ),
      objectNameByUniversalIdentifier: Object.fromEntries(
        neededObjects.map(({ universalIdentifier, nameSingular }) => [
          universalIdentifier,
          nameSingular,
        ]),
      ),
      existingFields,
      locale,
    });
  }

  private async loadCurrentMetadata(
    workspaceId: string,
  ): Promise<CurrentMetadata> {
    const { flatObjectMetadataMaps, flatFieldMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
      ]);

    return {
      existingObjects: Object.values(
        flatObjectMetadataMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .map((object) => ({
          id: object.id,
          universalIdentifier: object.universalIdentifier,
          nameSingular: object.nameSingular,
          labelSingular: object.labelSingular,
          labelPlural: object.labelPlural,
          isActive: object.isActive,
        })),
      existingFields: Object.values(flatFieldMetadataMaps.byUniversalIdentifier)
        .filter(isDefined)
        .map((field) => ({
          id: field.id,
          objectMetadataId: field.objectMetadataId,
          universalIdentifier: field.universalIdentifier,
          name: field.name,
          type: field.type,
          isUnique: field.isUnique,
          isActive: field.isActive,
          label: field.label,
        })),
    };
  }
}
