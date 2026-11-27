import { workflowStepManifestSchema } from 'twenty-shared/application';

import { buildWschatStepManifests } from 'src/engine/core-modules/wschat-bridge/utils/build-wschat-step-manifests.util';

const TARGET = { url: 'https://wschat.org/crm-actions/v1/', token: 'tok_123' };

describe('buildWschatStepManifests', () => {
  it('should find the client of the trigger record, then message them through WSChat', () => {
    const [findPerson, message] = buildWschatStepManifests({
      request: {
        action: 'message',
        text: 'Здравствуйте, {{person.name.firstName}}!',
      },
      target: TARGET,
      personIdVariable: '{{trigger.properties.after.personId}}',
      locale: 'ru',
    });

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
          headers: {
            Authorization: 'Bearer tok_123',
            'Content-Type': 'application/json',
          },
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

  it('should create a WSChat task straight from a person trigger', () => {
    const steps = buildWschatStepManifests({
      request: { action: 'task', title: 'Call {{person.name.firstName}}' },
      target: TARGET,
      locale: 'en',
    });

    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual(
      expect.objectContaining({
        name: 'Create a task in WSChat',
        input: expect.objectContaining({
          url: 'https://wschat.org/crm-actions/v1/tasks',
          body: {
            contact: '{{trigger.properties.after.wschatContactId}}',
            title: 'Call {{trigger.properties.after.name.firstName}}',
            key: `${steps[0].universalIdentifier}:{{trigger.properties.after.id}}:{{trigger.properties.after.updatedAt}}`,
          },
        }),
      }),
    );
  });
});
