import { computeMetadataNameFromLabel } from 'twenty-shared/metadata';
import { FieldMetadataType } from 'twenty-shared/types';

import {
  type WschatBridgeFieldDefinition,
  type WschatBridgeLocale,
  type WschatBridgeObjectDefinition,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';

export type WschatBridgeExistingObject = {
  id: string;
  universalIdentifier: string;
  nameSingular: string;
  labelSingular: string;
  labelPlural: string;
  isActive: boolean;
};

export type WschatBridgeExistingField = {
  id: string;
  objectMetadataId: string;
  universalIdentifier: string;
  name: string;
  type: FieldMetadataType;
  isUnique: boolean | null;
  isActive: boolean;
  label: string;
};

export type WschatBridgeObjectsPlan = {
  toCreate: WschatBridgeObjectDefinition[];
  toUpdate: {
    id: string;
    nameSingular: string;
    update: { isActive?: true; labelSingular?: string; labelPlural?: string };
  }[];
  conflicts: string[];
};

export type WschatBridgeFieldToCreate = {
  definition: WschatBridgeFieldDefinition;
  reportName: string;
  objectMetadataId: string;
  relationTargetObjectMetadataId?: string;
};

export type WschatBridgeFieldsPlan = {
  toCreate: WschatBridgeFieldToCreate[];
  toUpdate: {
    id: string;
    reportName: string;
    update: { isActive?: true; label?: string };
  }[];
  conflicts: string[];
};

// The reverse list's name is computed by Twenty from its label at creation, so it is always created from the English one
export const computeBridgeReverseFieldName = (
  relation: NonNullable<WschatBridgeFieldDefinition['relation']>,
): string => computeMetadataNameFromLabel({ label: relation.reverseLabel.en });

// Ours = our universal identifier; a same-name object that is not ours is a conflict and is never touched
export const planBridgeObjects = ({
  definitions,
  existingObjects,
  locale,
}: {
  definitions: WschatBridgeObjectDefinition[];
  existingObjects: WschatBridgeExistingObject[];
  // Absent: labels are left as they are (enforce without a locale must not undo a translation)
  locale?: WschatBridgeLocale;
}): WschatBridgeObjectsPlan => {
  const plan: WschatBridgeObjectsPlan = {
    toCreate: [],
    toUpdate: [],
    conflicts: [],
  };

  for (const definition of definitions) {
    const ownObject = existingObjects.find(
      ({ universalIdentifier }) =>
        universalIdentifier === definition.universalIdentifier,
    );

    if (ownObject === undefined) {
      const isNameTaken = existingObjects.some(
        ({ nameSingular }) => nameSingular === definition.nameSingular,
      );

      if (isNameTaken) {
        plan.conflicts.push(definition.nameSingular);
      } else {
        plan.toCreate.push(definition);
      }

      continue;
    }

    const update: WschatBridgeObjectsPlan['toUpdate'][number]['update'] = {
      ...(ownObject.isActive ? {} : { isActive: true as const }),
      ...(locale !== undefined &&
      ownObject.labelSingular !== definition.labelSingular[locale]
        ? { labelSingular: definition.labelSingular[locale] }
        : {}),
      ...(locale !== undefined &&
      ownObject.labelPlural !== definition.labelPlural[locale]
        ? { labelPlural: definition.labelPlural[locale] }
        : {}),
    };

    if (Object.keys(update).length > 0) {
      plan.toUpdate.push({
        id: ownObject.id,
        nameSingular: ownObject.nameSingular,
        update,
      });
    }
  }

  return plan;
};

// Fields whose object (or relation target) is missing or foreign are skipped and reported, never half-created
export const planBridgeFields = ({
  definitions,
  objectIdByUniversalIdentifier,
  objectNameByUniversalIdentifier,
  existingFields,
  locale,
}: {
  definitions: WschatBridgeFieldDefinition[];
  objectIdByUniversalIdentifier: Record<string, string>;
  objectNameByUniversalIdentifier: Record<string, string>;
  existingFields: WschatBridgeExistingField[];
  locale?: WschatBridgeLocale;
}): WschatBridgeFieldsPlan => {
  const plan: WschatBridgeFieldsPlan = {
    toCreate: [],
    toUpdate: [],
    conflicts: [],
  };

  for (const definition of definitions) {
    const objectMetadataId =
      objectIdByUniversalIdentifier[definition.objectUniversalIdentifier];
    const reportName = `${objectNameByUniversalIdentifier[definition.objectUniversalIdentifier] ?? definition.objectUniversalIdentifier}.${definition.name}`;
    const relationTargetObjectMetadataId =
      definition.relation === undefined
        ? undefined
        : objectIdByUniversalIdentifier[
            definition.relation.targetObjectUniversalIdentifier
          ];

    if (
      objectMetadataId === undefined ||
      (definition.relation !== undefined &&
        relationTargetObjectMetadataId === undefined)
    ) {
      plan.conflicts.push(reportName);
      continue;
    }

    const ownField = existingFields.find(
      ({ universalIdentifier }) =>
        universalIdentifier === definition.universalIdentifier,
    );

    if (ownField === undefined) {
      const isNameTaken = existingFields.some(
        (field) =>
          field.objectMetadataId === objectMetadataId &&
          field.name === definition.name,
      );

      if (isNameTaken) {
        plan.conflicts.push(reportName);
      } else {
        plan.toCreate.push({
          definition,
          reportName,
          objectMetadataId,
          relationTargetObjectMetadataId,
        });
      }

      continue;
    }

    if (
      ownField.name !== definition.name ||
      ownField.type !== definition.type ||
      (ownField.isUnique ?? false) !== definition.isUnique
    ) {
      plan.conflicts.push(reportName);
      continue;
    }

    const update = {
      ...(ownField.isActive ? {} : { isActive: true as const }),
      ...(locale !== undefined && ownField.label !== definition.label[locale]
        ? { label: definition.label[locale] }
        : {}),
    };

    if (Object.keys(update).length > 0) {
      plan.toUpdate.push({ id: ownField.id, reportName, update });
    }

    if (
      locale !== undefined &&
      definition.relation !== undefined &&
      relationTargetObjectMetadataId !== undefined
    ) {
      const reverseName = computeBridgeReverseFieldName(definition.relation);
      const reverseField = existingFields.find(
        (field) =>
          field.objectMetadataId === relationTargetObjectMetadataId &&
          field.name === reverseName &&
          field.type === FieldMetadataType.RELATION,
      );
      const reverseLabel = definition.relation.reverseLabel[locale];

      if (reverseField !== undefined && reverseField.label !== reverseLabel) {
        plan.toUpdate.push({
          id: reverseField.id,
          reportName: `${reportName}~${reverseName}`,
          update: { label: reverseLabel },
        });
      }
    }
  }

  return plan;
};
