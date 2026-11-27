import { type WorkflowManifest } from 'twenty-shared/application';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';

import { type WschatBridgeLocale } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';
import {
  findPersonStep,
  httpStep,
  TRIGGER_RECORD_KEY,
  type WschatBridgeActionsTarget,
  WSCHAT_STEP_NAMES,
} from 'src/engine/core-modules/wschat-bridge/utils/build-sample-action-workflows.util';

export type WschatStepRequest =
  | { action: 'message'; text: string }
  | { action: 'task'; title: string };

// The samples' steps for one more workflow: find the client unless the trigger record is the person, then call WSChat.
// `{{person.` in the text stands for that client's record
export const buildWschatStepManifests = ({
  request,
  target,
  personIdVariable,
  locale,
}: {
  request: WschatStepRequest;
  target: WschatBridgeActionsTarget;
  personIdVariable?: string;
  locale: WschatBridgeLocale;
}): WorkflowManifest['version']['steps'] => {
  const findPersonId = v4();
  const actionId = v4();
  const person = isDefined(personIdVariable)
    ? `${findPersonId}.first`
    : 'trigger.properties.after';
  const withPerson = (text: string) =>
    text.split('{{person.').join(`{{${person}.`);
  const step = { universalIdentifier: actionId, nextStepIds: [], target };
  const common = {
    contact: `{{${person}.wschatContactId}}`,
    // Per step: two WSChat steps on the same record change must not cancel each other
    key: `${actionId}:${TRIGGER_RECORD_KEY}`,
  };

  const action =
    request.action === 'message'
      ? httpStep({
          ...step,
          name: WSCHAT_STEP_NAMES.sendMessage[locale],
          path: '/messages',
          body: { ...common, text: withPerson(request.text), channel: 'last' },
        })
      : httpStep({
          ...step,
          name: WSCHAT_STEP_NAMES.createTask[locale],
          path: '/tasks',
          body: { ...common, title: withPerson(request.title) },
        });

  if (!isDefined(personIdVariable)) {
    return [action];
  }

  return [
    findPersonStep({
      universalIdentifier: findPersonId,
      name: WSCHAT_STEP_NAMES.findClient[locale],
      nextStepIds: [actionId],
      filterId: v4(),
      personIdVariable,
    }),
    action,
  ];
};
