import {
  type StepFilter,
  type StepFilterGroup,
  StepLogicalOperator,
  ViewFilterOperand,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import {
  type BaseDatabaseEventTriggerSettings,
  type UpdateEventTriggerSettings,
} from 'src/modules/workflow/workflow-trigger/automated-trigger/constants/automated-trigger-settings';

export type WschatStepAction = 'message' | 'task';

export type WschatStepTriggerSettings = BaseDatabaseEventTriggerSettings &
  Partial<UpdateEventTriggerSettings>;

// Person fields WSChat rewrites when a conversation starts or moves, which the step's own message can cause
const PERSON_ACTIVITY_FIELDS = ['wschatLastContactAt', 'wschatLastChannel'];
const LAST_MESSAGE_FIELDS = ['lastMessageAt', 'lastMessageFrom'];

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const isClientOnly = (value: string): boolean => {
  const parsed = parseJson(value);

  return Array.isArray(parsed) && parsed.length === 1 && parsed[0] === 'CLIENT';
};

const isFalse = (value: string): boolean => value === 'false';

// As evaluateFilterConditions: no groups ANDs every filter, otherwise only AND groups up to a root keep it binding
const isInAndOnlyGroups = (
  stepFilterGroupId: string,
  stepFilterGroups: StepFilterGroup[],
): boolean => {
  if (stepFilterGroups.length === 0) {
    return true;
  }

  const seen = new Set<string>();
  let groupId: string | undefined = stepFilterGroupId;

  while (isDefined(groupId)) {
    const group = stepFilterGroups.find(({ id }) => id === groupId);

    if (
      seen.has(groupId) ||
      group?.logicalOperator !== StepLogicalOperator.AND
    ) {
      return false;
    }

    seen.add(groupId);
    groupId = group.parentStepFilterGroupId;
  }

  return true;
};

const hasBindingFilter = (
  filter: BaseDatabaseEventTriggerSettings['filter'],
  fieldName: string,
  acceptsValue: (value: string) => boolean,
): boolean =>
  (filter?.stepFilters ?? []).some(
    ({ stepOutputKey, operand, value, stepFilterGroupId }: StepFilter) =>
      stepOutputKey === `{{trigger.properties.after.${fieldName}}}` &&
      operand === ViewFilterOperand.IS &&
      acceptsValue(value) &&
      isInAndOnlyGroups(stepFilterGroupId, filter?.stepFilterGroups ?? []),
  );

// Why a record trigger would fire on history or on the step's own result; undefined when it is safe
export const findWschatTriggerProblem = ({
  action,
  settings,
  hasImportedFlag,
}: {
  action: WschatStepAction;
  settings: WschatStepTriggerSettings;
  hasImportedFlag: boolean;
}): string | undefined => {
  const [objectName, eventAction] = settings.eventName.split('.');
  const fields = settings.fields ?? [];
  const isMessage = action === 'message';

  if (eventAction !== 'created' && eventAction !== 'updated') {
    return `"${settings.eventName}" cannot start a WSChat step: use "created" or "updated" ("upserted" fires on every repeated sync, a deleted record is gone).`;
  }

  if (eventAction === 'updated' && fields.length === 0) {
    return 'An "updated" trigger must list the fields it watches in settings.fields: WSChat updates its records after every message, so it would start the workflow again on its own result.';
  }

  // History arrives as inserts, which carry no updated fields: only "created" can fire on it
  if (
    eventAction === 'created' &&
    hasImportedFlag &&
    !hasBindingFilter(settings.filter, 'wschatImported', isFalse)
  ) {
    return 'Add the filter wschatImported IS "false" (type BOOLEAN, value "false") in an AND group: records WSChat loads from history must not reach clients.';
  }

  const repliesToClient =
    objectName === 'wschatConversation' &&
    (eventAction === 'created' ||
      fields.some((field) => LAST_MESSAGE_FIELDS.includes(field)));

  if (
    isMessage &&
    repliesToClient &&
    !hasBindingFilter(settings.filter, 'lastMessageFrom', isClientOnly)
  ) {
    return 'Add the filter lastMessageFrom IS ["CLIENT"] (type SELECT, value "[\\"CLIENT\\"]", exactly this one option) in an AND group: the message this step sends, and conversations an employee or the robot starts, would start the workflow again.';
  }

  if (
    isMessage &&
    objectName === 'person' &&
    fields.some((field) => PERSON_ACTIVITY_FIELDS.includes(field))
  ) {
    return `Do not watch ${PERSON_ACTIVITY_FIELDS.join(' or ')}: WSChat rewrites them when a conversation starts, which this step's own message can do.`;
  }

  if (action === 'task' && objectName === 'task') {
    return 'A WSChat task cannot follow a task trigger: the task WSChat creates comes back as a CRM task and would start the workflow again. A CRM task already reaches WSChat when it is linked to a client or "Show in WSChat" is ticked.';
  }

  return undefined;
};
