import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { WorkflowActionType } from 'twenty-shared/workflow';

import {
  findWschatTriggerProblem,
  type WschatStepAction,
  type WschatStepTriggerSettings,
} from 'src/engine/core-modules/wschat-bridge/utils/find-wschat-trigger-problem.util';
import {
  planWschatStepPlacement,
  type WschatStepPlacement,
} from 'src/engine/core-modules/wschat-bridge/utils/plan-wschat-step-placement.util';
import { computeMorphOrRelationFieldJoinColumnName } from 'src/engine/metadata-modules/field-metadata/utils/compute-morph-or-relation-field-join-column-name.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { isFlatFieldMetadataOfType } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-flat-field-metadata-of-type.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';
import {
  type WorkflowTrigger,
  WorkflowTriggerType,
} from 'src/modules/workflow/workflow-trigger/types/workflow-trigger.type';

// A record variable prefix ("trigger.payload"), or the items of a FIND_RECORDS step the tool loops over
export type WschatStepRecordSource =
  | { kind: 'record'; variable: string }
  | { kind: 'loop'; items: string };

// personJoinColumn: the record's link to its person; absent when the record is the person
export type WschatStepPlan =
  | { problem: string }
  | {
      source: WschatStepRecordSource;
      personJoinColumn?: string;
      placement: WschatStepPlacement;
    };

type FlatMaps = {
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
};

const findObject = (
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
  nameSingular: string,
): FlatObjectMetadata | undefined =>
  Object.values(flatObjectMetadataMaps.byUniversalIdentifier).find(
    (candidate) => candidate?.nameSingular === nameSingular,
  );

const findObjectFields = (
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
  object: FlatObjectMetadata,
): FlatFieldMetadata[] =>
  Object.values(flatFieldMetadataMaps.byUniversalIdentifier).filter(
    (field): field is FlatFieldMetadata =>
      field?.objectMetadataId === object.id,
  );

const findPersonJoinColumn = (
  objectFields: FlatFieldMetadata[],
  person: FlatObjectMetadata | undefined,
): string | undefined => {
  const relations = objectFields.filter(
    (field) =>
      isFlatFieldMetadataOfType(field, FieldMetadataType.RELATION) &&
      field.settings.relationType === RelationType.MANY_TO_ONE &&
      field.relationTargetObjectMetadataId === person?.id,
  );
  const relation =
    relations.length === 1
      ? relations[0]
      : relations.find(({ name }) => name === 'person');

  return isDefined(relation)
    ? computeMorphOrRelationFieldJoinColumnName({ name: relation.name })
    : undefined;
};

// Refuses what would fire on history or on the step's own result (README, "AI chat: WSChat steps")
export const planWschatStep = ({
  action,
  trigger,
  steps,
  parentStepId,
  branchId,
  forEachRecordOf,
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
}: {
  action: WschatStepAction;
  trigger: WorkflowTrigger | null;
  steps: WorkflowAction[];
  parentStepId?: string;
  branchId?: string;
  forEachRecordOf?: string;
} & FlatMaps): WschatStepPlan => {
  if (!isDefined(trigger)) {
    return { problem: 'Set the trigger first.' };
  }

  let source: WschatStepRecordSource | undefined;
  let objectName: string | undefined;

  if (trigger.type === WorkflowTriggerType.DATABASE_EVENT) {
    const settings = trigger.settings as WschatStepTriggerSettings;
    const [triggerObjectName] = settings.eventName.split('.');
    const triggerObject = findObject(flatObjectMetadataMaps, triggerObjectName);
    const problem = findWschatTriggerProblem({
      action,
      settings,
      hasImportedFlag:
        isDefined(triggerObject) &&
        findObjectFields(flatFieldMetadataMaps, triggerObject).some(
          ({ name }) => name === 'wschatImported',
        ),
    });

    if (isDefined(problem)) {
      return { problem };
    }

    source = { kind: 'record', variable: 'trigger.properties.after' };
    objectName = triggerObjectName;
  } else if (
    trigger.type === WorkflowTriggerType.MANUAL &&
    trigger.settings.availability?.type === 'SINGLE_RECORD'
  ) {
    source = { kind: 'record', variable: 'trigger.payload' };
    objectName = trigger.settings.availability.objectNameSingular;
  }

  if (isDefined(forEachRecordOf)) {
    const recordsStep = steps.find(({ id }) => id === forEachRecordOf);

    if (recordsStep?.type !== WorkflowActionType.FIND_RECORDS) {
      return {
        problem: `forEachRecordOf must be the id of a FIND_RECORDS step of this version, not "${forEachRecordOf}".`,
      };
    }

    source = { kind: 'loop', items: `{{${recordsStep.id}.all}}` };
    objectName = recordsStep.settings.input.objectName;
  }

  if (!isDefined(source) || !isDefined(objectName)) {
    return {
      problem:
        'This trigger brings no record: add a FIND_RECORDS step listing the clients and pass its id as forEachRecordOf, or use a record trigger or a manual trigger on one record.',
    };
  }

  const object = findObject(flatObjectMetadataMaps, objectName);

  if (!isDefined(object)) {
    return { problem: `Object "${objectName}" does not exist.` };
  }

  const personJoinColumn =
    objectName === 'person'
      ? undefined
      : findPersonJoinColumn(
          findObjectFields(flatFieldMetadataMaps, object),
          findObject(flatObjectMetadataMaps, 'person'),
        );

  if (objectName !== 'person' && !isDefined(personJoinColumn)) {
    return {
      problem: `"${objectName}" records have no single link to a person, so there is no client to reach.`,
    };
  }

  const placement = planWschatStepPlacement({
    trigger,
    steps,
    parentStepId: parentStepId ?? forEachRecordOf,
    branchId,
  });

  if ('problem' in placement) {
    return placement;
  }

  return { source, personJoinColumn, placement };
};
