import {
  FieldMetadataType,
  RelationType,
  type StepFilter,
  ViewFilterOperand,
} from 'twenty-shared/types';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { TRIGGER_STEP_ID } from 'twenty-shared/workflow';

import { computeMorphOrRelationFieldJoinColumnName } from 'src/engine/metadata-modules/field-metadata/utils/compute-morph-or-relation-field-join-column-name.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { isFlatFieldMetadataOfType } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-flat-field-metadata-of-type.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';
import {
  type BaseDatabaseEventTriggerSettings,
  type UpdateEventTriggerSettings,
} from 'src/modules/workflow/workflow-trigger/automated-trigger/constants/automated-trigger-settings';
import {
  type WorkflowTrigger,
  WorkflowTriggerType,
} from 'src/modules/workflow/workflow-trigger/types/workflow-trigger.type';

export type WschatStepAction = 'message' | 'task';

// personIdVariable: the trigger record's link to its person; absent when the record is the person
export type WschatStepPlan =
  | { problem: string }
  | { parentStepId: string; personIdVariable?: string };

const CONVERSATION = 'wschatConversation';
const LAST_MESSAGE_FIELDS = ['lastMessageAt', 'lastMessageFrom'];

const hasFilter = (
  stepFilters: StepFilter[],
  fieldName: string,
  acceptsValue: (value: string) => boolean,
): boolean =>
  stepFilters.some(
    ({ stepOutputKey, operand, value }) =>
      stepOutputKey === `{{trigger.properties.after.${fieldName}}}` &&
      operand === ViewFilterOperand.IS &&
      acceptsValue(value),
  );

const findPersonJoinColumn = ({
  objectFields,
  flatObjectMetadataMaps,
}: {
  objectFields: FlatFieldMetadata[];
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
}): string | undefined => {
  const person = Object.values(
    flatObjectMetadataMaps.byUniversalIdentifier,
  ).find((candidate) => candidate?.nameSingular === 'person');
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

const findDefaultParentStepId = (
  steps: WorkflowAction[],
): string | undefined => {
  if (steps.length === 0) {
    return TRIGGER_STEP_ID;
  }

  const leafSteps = steps.filter(
    ({ nextStepIds }) => !isNonEmptyArray(nextStepIds),
  );

  return leafSteps.length === 1 ? leafSteps[0].id : undefined;
};

// Refuses triggers that would fire on history or on the step's own result (README, "AI chat: WSChat steps")
export const planWschatStep = ({
  action,
  trigger,
  steps,
  parentStepId,
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
}: {
  action: WschatStepAction;
  trigger: WorkflowTrigger | null;
  steps: WorkflowAction[];
  parentStepId?: string;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
}): WschatStepPlan => {
  if (trigger?.type !== WorkflowTriggerType.DATABASE_EVENT) {
    return {
      problem:
        'Set the trigger first: the WSChat step needs a record event (DATABASE_EVENT "created" or "updated") whose record leads to the client.',
    };
  }

  const settings = trigger.settings as BaseDatabaseEventTriggerSettings &
    Partial<UpdateEventTriggerSettings>;
  const [objectName, eventAction] = settings.eventName.split('.');
  const stepFilters = settings.filter?.stepFilters ?? [];

  if (eventAction !== 'created' && eventAction !== 'updated') {
    return {
      problem: `"${settings.eventName}" cannot start a WSChat step: use "created" or "updated" ("upserted" fires on every repeated sync, a deleted record is gone).`,
    };
  }

  const object = Object.values(
    flatObjectMetadataMaps.byUniversalIdentifier,
  ).find((candidate) => candidate?.nameSingular === objectName);

  if (!isDefined(object)) {
    return { problem: `The trigger's object "${objectName}" does not exist.` };
  }

  const objectFields = Object.values(
    flatFieldMetadataMaps.byUniversalIdentifier,
  ).filter(
    (field): field is FlatFieldMetadata =>
      field?.objectMetadataId === object.id,
  );
  const watchedFields = settings.fields ?? [];

  if (eventAction === 'updated' && watchedFields.length === 0) {
    return {
      problem:
        'An "updated" trigger must list the fields it watches in settings.fields (e.g. ["lastMessageAt"] or ["state", "outcomeTone"]): WSChat updates its records after every message, so an unrestricted trigger would start this workflow again on its own result.',
    };
  }

  if (
    objectFields.some(({ name }) => name === 'wschatImported') &&
    !hasFilter(stepFilters, 'wschatImported', (value) => value === 'false')
  ) {
    return {
      problem:
        'Add the trigger filter wschatImported IS "false" (type BOOLEAN, stepOutputKey "{{trigger.properties.after.wschatImported}}", value "false"): records WSChat loads from history must not act on clients.',
    };
  }

  if (
    action === 'message' &&
    objectName === CONVERSATION &&
    watchedFields.some((field) => LAST_MESSAGE_FIELDS.includes(field)) &&
    !hasFilter(stepFilters, 'lastMessageFrom', (value) =>
      value.includes('CLIENT'),
    )
  ) {
    return {
      problem:
        'Add the trigger filter lastMessageFrom IS CLIENT (type SELECT, stepOutputKey "{{trigger.properties.after.lastMessageFrom}}", value "[\\"CLIENT\\"]"): without it the reply this step sends starts the workflow again.',
    };
  }

  if (action === 'task' && objectName === 'task') {
    return {
      problem:
        'A WSChat task cannot follow a task trigger: the task WSChat creates comes back as a CRM task and would start this workflow again. A CRM task already reaches WSChat when it is linked to a client or "Show in WSChat" is ticked.',
    };
  }

  const personJoinColumn =
    objectName === 'person'
      ? undefined
      : findPersonJoinColumn({ objectFields, flatObjectMetadataMaps });

  if (objectName !== 'person' && !isDefined(personJoinColumn)) {
    return {
      problem: `"${objectName}" records have no single link to a person, so there is no client to reach. Trigger on person, wschatConversation, wschatCall, or another object with one relation to a person.`,
    };
  }

  const resolvedParentStepId = parentStepId ?? findDefaultParentStepId(steps);

  if (!isDefined(resolvedParentStepId)) {
    return {
      problem:
        'The workflow has several last steps: pass parentStepId (a step id, or "trigger") to say where the WSChat step goes.',
    };
  }

  if (
    resolvedParentStepId !== TRIGGER_STEP_ID &&
    !steps.some(({ id }) => id === resolvedParentStepId)
  ) {
    return {
      problem: `Step "${resolvedParentStepId}" is not in this workflow version.`,
    };
  }

  return {
    parentStepId: resolvedParentStepId,
    ...(isDefined(personJoinColumn) && {
      personIdVariable: `{{trigger.properties.after.${personJoinColumn}}}`,
    }),
  };
};
