import { workflowStepManifestSchema } from 'twenty-shared/application';

import {
  buildWschatStepManifests,
  findSameWschatStep,
} from 'src/engine/core-modules/wschat-bridge/utils/build-wschat-step-manifests.util';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';

const ACTIONS_URL = 'https://wschat.org/crm-actions/v1/';
const TRIGGER_RECORD = {
  kind: 'record',
  variable: 'trigger.properties.after',
} as const;

describe('buildWschatStepManifests', () => {
  it('should find the client of the trigger record, then message them with no token in the step', () => {
    const {
      steps: [findPerson, message],
      isLoop,
    } = buildWschatStepManifests({
      request: {
        action: 'message',
        text: 'Здравствуйте, {{ person.name.firstName }}!',
      },
      actionsUrl: ACTIONS_URL,
      source: TRIGGER_RECORD,
      personJoinColumn: 'personId',
      locale: 'ru',
    });

    expect(isLoop).toBe(false);
    expect(findPerson).toEqual(
      expect.objectContaining({
        type: 'FIND_RECORDS',
        name: 'Найти клиента',
        nextStepIds: [message.universalIdentifier],
        input: expect.objectContaining({
          filter: {
            recordFilters: [
              expect.objectContaining({
                value: '["{{trigger.properties.after.personId}}"]',
              }),
            ],
          },
        }),
      }),
    );
    expect(message).toEqual(
      expect.objectContaining({
        type: 'HTTP_REQUEST',
        name: 'Отправить сообщение из WSChat',
        input: {
          url: 'https://wschat.org/crm-actions/v1/messages',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            contact: `{{${findPerson.universalIdentifier}.first.wschatContactId}}`,
            text: `Здравствуйте, {{${findPerson.universalIdentifier}.first.name.firstName}}!`,
            channel: 'last',
            key: `${message.universalIdentifier}:{{trigger.properties.after.id}}:{{trigger.properties.after.updatedAt}}`,
          },
        },
      }),
    );

    for (const step of [findPerson, message]) {
      expect(() => workflowStepManifestSchema.parse(step)).not.toThrow();
    }
  });

  it('should create a WSChat task straight from the record a manual trigger was run on', () => {
    const { steps } = buildWschatStepManifests({
      request: { action: 'task', title: 'Call {{person.name.firstName}}' },
      actionsUrl: ACTIONS_URL,
      source: { kind: 'record', variable: 'trigger.payload' },
      locale: 'en',
    });

    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual(
      expect.objectContaining({
        name: 'Create a task in WSChat',
        input: expect.objectContaining({
          url: 'https://wschat.org/crm-actions/v1/tasks',
          body: {
            contact: '{{trigger.payload.wschatContactId}}',
            title: 'Call {{trigger.payload.name.firstName}}',
            key: `${steps[0].universalIdentifier}:{{trigger.payload.id}}:{{trigger.payload.updatedAt}}`,
          },
        }),
      }),
    );
  });

  it('should loop over found records, reach each client and come back to the iterator', () => {
    const {
      steps: [iterator, findPerson, message],
      isLoop,
    } = buildWschatStepManifests({
      request: { action: 'message', text: 'Reminder' },
      actionsUrl: ACTIONS_URL,
      source: { kind: 'loop', items: '{{find-step.all}}' },
      personJoinColumn: 'personId',
      locale: 'en',
    });
    const currentItem = `${iterator.universalIdentifier}.currentItem`;

    expect(isLoop).toBe(true);
    expect(iterator).toEqual(
      expect.objectContaining({
        type: 'ITERATOR',
        input: {
          items: '{{find-step.all}}',
          initialLoopStepIds: [findPerson.universalIdentifier],
        },
      }),
    );
    expect(JSON.stringify(findPerson)).toContain(`{{${currentItem}.personId}}`);
    expect(message.nextStepIds).toEqual([iterator.universalIdentifier]);
    expect(message).toEqual(
      expect.objectContaining({
        input: expect.objectContaining({
          body: expect.objectContaining({
            key: `${message.universalIdentifier}:{{${currentItem}.id}}:{{${currentItem}.updatedAt}}`,
          }),
        }),
      }),
    );
  });
});

describe('findSameWschatStep', () => {
  const step = (url: string, body: object) =>
    ({
      id: 'existing',
      name: 'Send a message from WSChat',
      type: 'HTTP_REQUEST',
      settings: { input: { url, method: 'POST', body } },
    }) as unknown as WorkflowAction;

  it('should find the same message to the same endpoint, whatever its person references became', () => {
    const existing = step('https://wschat.org/crm-actions/v1/messages', {
      text: 'Hi {{0f22da47-eb6b-4eb0-ab43-c5e0502da88d.first.name.firstName}}',
    });

    expect(
      findSameWschatStep({
        steps: [existing],
        actionsUrl: ACTIONS_URL,
        request: { action: 'message', text: 'Hi {{ person.name.firstName }}' },
      }),
    ).toBe(existing);
    expect(
      findSameWschatStep({
        steps: [existing],
        actionsUrl: ACTIONS_URL,
        request: { action: 'message', text: 'Hi there' },
      }),
    ).toBeUndefined();
    expect(
      findSameWschatStep({
        steps: [existing],
        actionsUrl: ACTIONS_URL,
        request: { action: 'task', title: 'Hi {{person.name.firstName}}' },
      }),
    ).toBeUndefined();
  });
});
