import { isObject, isString } from '@sniptt/guards';
import { type WorkflowManifest } from 'twenty-shared/application';
import { isDefined } from 'twenty-shared/utils';
import { WorkflowActionType } from 'twenty-shared/workflow';
import { v4 } from 'uuid';

import { type WschatBridgeLocale } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';
import {
  buildWschatActionUrl,
  findPersonStep,
  httpStep,
  WSCHAT_STEP_NAMES,
} from 'src/engine/core-modules/wschat-bridge/utils/build-sample-action-workflows.util';
import { type WschatStepRecordSource } from 'src/engine/core-modules/wschat-bridge/utils/plan-wschat-step.util';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';

export type WschatStepRequest =
  | { action: 'message'; text: string }
  | { action: 'task'; title: string };

type WschatStepManifest = WorkflowManifest['version']['steps'][number];

// {{person.<field>}}, spaces allowed, stands for the client's record
const PERSON_REFERENCE = /\{\{\s*person\.([^}]*?)\s*\}\}/g;

// What a person reference became in a built step, back to {{person.<field>}}, to compare texts
const BUILT_PERSON_REFERENCE =
  /\{\{\s*(?:person|trigger\.properties\.after|trigger\.payload|[0-9a-f-]{36}\.(?:first|currentItem))\.([^}]*?)\s*\}\}/g;

const requestPath = (request: WschatStepRequest) =>
  request.action === 'message' ? '/messages' : '/tasks';

const requestText = (request: WschatStepRequest) =>
  request.action === 'message' ? request.text : request.title;

// The samples' steps for one more workflow: a loop when the records come from a FIND_RECORDS step,
// "find the client" unless the record is the person, then the WSChat call
export const buildWschatStepManifests = ({
  request,
  actionsUrl,
  source,
  personJoinColumn,
  locale,
}: {
  request: WschatStepRequest;
  actionsUrl: string;
  source: WschatStepRecordSource;
  personJoinColumn?: string;
  locale: WschatBridgeLocale;
}): { steps: WschatStepManifest[]; isLoop: boolean } => {
  const iteratorId = v4();
  const findPersonId = v4();
  const actionId = v4();
  const isLoop = source.kind === 'loop';
  const record = isLoop ? `${iteratorId}.currentItem` : source.variable;
  const person = isDefined(personJoinColumn) ? `${findPersonId}.first` : record;
  const text = requestText(request).replace(
    PERSON_REFERENCE,
    `{{${person}.$1}}`,
  );
  const common = {
    contact: `{{${person}.wschatContactId}}`,
    // Per step: two WSChat steps on the same record change must not cancel each other
    key: `${actionId}:{{${record}.id}}:{{${record}.updatedAt}}`,
  };
  const action = httpStep({
    universalIdentifier: actionId,
    // Back to the iterator, or the loop would run once
    nextStepIds: isLoop ? [iteratorId] : [],
    actionsUrl,
    ...(request.action === 'message'
      ? {
          name: WSCHAT_STEP_NAMES.sendMessage[locale],
          path: '/messages' as const,
          body: { ...common, text, channel: 'last' },
        }
      : {
          name: WSCHAT_STEP_NAMES.createTask[locale],
          path: '/tasks' as const,
          body: { ...common, title: text },
        }),
  });
  const body = isDefined(personJoinColumn)
    ? [
        findPersonStep({
          universalIdentifier: findPersonId,
          name: WSCHAT_STEP_NAMES.findClient[locale],
          nextStepIds: [actionId],
          filterId: v4(),
          personIdVariable: `{{${record}.${personJoinColumn}}}`,
        }),
        action,
      ]
    : [action];

  if (source.kind === 'record') {
    return { steps: body, isLoop: false };
  }

  return {
    steps: [
      {
        universalIdentifier: iteratorId,
        name: WSCHAT_STEP_NAMES.forEachClient[locale],
        type: 'ITERATOR',
        nextStepIds: [],
        input: {
          items: source.items,
          initialLoopStepIds: [body[0].universalIdentifier],
        },
      },
      ...body,
    ],
    isLoop: true,
  };
};

// The draft's WSChat step with the same path and text, so a repeated tool call does not send twice
export const findSameWschatStep = ({
  steps,
  actionsUrl,
  request,
}: {
  steps: WorkflowAction[];
  actionsUrl: string;
  request: WschatStepRequest;
}): WorkflowAction | undefined => {
  const field = request.action === 'message' ? 'text' : 'title';
  const normalize = (text: string) =>
    text.trim().replace(BUILT_PERSON_REFERENCE, '{{person.$1}}');
  const text = normalize(requestText(request));
  const url = buildWschatActionUrl(actionsUrl, requestPath(request));

  return steps.find((step) => {
    if (step.type !== WorkflowActionType.HTTP_REQUEST) {
      return false;
    }

    const { url: stepUrl, body } = step.settings.input;
    const stepText = isObject(body) ? body[field] : undefined;

    return (
      stepUrl === url && isString(stepText) && normalize(stepText) === text
    );
  });
};
