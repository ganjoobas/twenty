import { workflowManifestSchema } from 'twenty-shared/application';

import { buildSampleActionWorkflows } from 'src/engine/core-modules/wschat-bridge/utils/build-sample-action-workflows.util';

const ACTIONS_URL = 'https://wschat.org/crm-actions/v1/';

const build = (locale: 'en' | 'ru' = 'ru') =>
  buildSampleActionWorkflows({ actionsUrl: ACTIONS_URL, locale });

const httpSteps = () =>
  build().flatMap(({ manifest }) =>
    manifest.version.steps.filter((step) => step.type === 'HTTP_REQUEST'),
  );

describe('buildSampleActionWorkflows', () => {
  it('should build three manifests upstream accepts, named in the workspace language', () => {
    const samples = build();

    expect(samples.map(({ name }) => name)).toEqual([
      'Пропущенный звонок → задача «Перезвонить» в WSChat',
      'Обращение закрыто успешно → сообщение клиенту',
      'Напоминание клиенту по расписанию',
    ]);

    for (const { manifest } of [...samples, ...build('en')]) {
      expect(() => workflowManifestSchema.parse(manifest)).not.toThrow();
    }
  });

  it('should call WSChat with no token in the step and a repeat key per record change', () => {
    const steps = httpSteps();

    expect(steps.map((step) => step.input.url)).toEqual([
      'https://wschat.org/crm-actions/v1/tasks',
      'https://wschat.org/crm-actions/v1/messages',
      'https://wschat.org/crm-actions/v1/messages',
    ]);

    for (const step of steps) {
      expect(step.input.method).toBe('POST');
      expect(step.input.headers).toEqual({
        'Content-Type': 'application/json',
      });
    }

    expect(steps[0].input.body).toEqual(
      expect.objectContaining({
        key: 'missed-call:{{trigger.properties.after.id}}:{{trigger.properties.after.updatedAt}}',
      }),
    );
    expect(steps[1].input.body).toEqual(
      expect.objectContaining({ channel: 'last' }),
    );
  });

  it('should only start on live missed calls and on closes, never on WSChat later updates', () => {
    const [missedCall, closedConversation, reminder] = build();
    const missedTrigger = missedCall.manifest.version.trigger;
    const closedTrigger = closedConversation.manifest.version.trigger;

    expect(missedTrigger.type).toBe('DATABASE_EVENT');
    expect(
      missedTrigger.type === 'DATABASE_EVENT' && missedTrigger.settings.action,
    ).toBe('created');
    expect(
      closedTrigger.type === 'DATABASE_EVENT' &&
        closedTrigger.settings.fieldUniversalIdentifiers?.length,
    ).toBe(2);
    expect(
      closedTrigger.type === 'DATABASE_EVENT' &&
        closedTrigger.settings.filter?.stepFilters.map(
          ({ stepOutputKey, value }) => `${stepOutputKey}=${value}`,
        ),
    ).toEqual([
      '{{trigger.properties.after.state}}=["CLOSED"]',
      '{{trigger.properties.after.outcomeTone}}=["SUCCESS"]',
      '{{trigger.properties.after.wschatImported}}=false',
      '{{trigger.properties.after.personId}}=',
    ]);
    expect(reminder.manifest.version.trigger).toEqual(
      expect.objectContaining({
        type: 'CRON',
        settings: { type: 'CUSTOM', pattern: '0 4 1 * *' },
      }),
    );
  });

  it('should loop the reminder back to its iterator', () => {
    const steps = build()[2].manifest.version.steps;
    const loop = steps.find((step) => step.type === 'ITERATOR');
    const send = steps.find((step) => step.type === 'HTTP_REQUEST');

    expect(send?.nextStepIds).toEqual([loop?.universalIdentifier]);
    expect(loop?.type === 'ITERATOR' && loop.input.initialLoopStepIds).toEqual([
      send?.universalIdentifier,
    ]);
  });
});
