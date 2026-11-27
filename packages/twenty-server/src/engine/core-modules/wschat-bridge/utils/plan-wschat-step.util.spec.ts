import {
  FieldMetadataType,
  RelationType,
  ViewFilterOperand,
} from 'twenty-shared/types';

import { planWschatStep } from 'src/engine/core-modules/wschat-bridge/utils/plan-wschat-step.util';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';
import {
  type WorkflowTrigger,
  WorkflowTriggerType,
} from 'src/modules/workflow/workflow-trigger/types/workflow-trigger.type';

const PERSON = 'object-person';
const CONVERSATION = 'object-conversation';
const TASK = 'object-task';
const COMPANY = 'object-company';

const field = (
  objectMetadataId: string,
  name: string,
  overrides: Record<string, unknown> = {},
) => ({
  id: `${objectMetadataId}.${name}`,
  objectMetadataId,
  name,
  type: FieldMetadataType.BOOLEAN,
  ...overrides,
});

const relationToPerson = (objectMetadataId: string, name: string) =>
  field(objectMetadataId, name, {
    type: FieldMetadataType.RELATION,
    settings: { relationType: RelationType.MANY_TO_ONE },
    relationTargetObjectMetadataId: PERSON,
  });

const byUniversalIdentifier = (
  entities: { id: string; [key: string]: unknown }[],
) =>
  ({
    byUniversalIdentifier: Object.fromEntries(
      entities.map((entity) => [entity.id, entity]),
    ),
  }) as never;

const FLAT_MAPS = {
  flatObjectMetadataMaps: byUniversalIdentifier([
    { id: PERSON, nameSingular: 'person' },
    { id: CONVERSATION, nameSingular: 'wschatConversation' },
    { id: TASK, nameSingular: 'task' },
    { id: COMPANY, nameSingular: 'company' },
  ]),
  flatFieldMetadataMaps: byUniversalIdentifier([
    field(PERSON, 'wschatImported'),
    field(CONVERSATION, 'wschatImported'),
    field(CONVERSATION, 'lastMessageAt', { type: FieldMetadataType.DATE_TIME }),
    relationToPerson(CONVERSATION, 'person'),
    field(TASK, 'wschatImported'),
    field(COMPANY, 'wschatImported'),
  ]),
};

const filter = (fieldName: string, value: string) => ({
  id: fieldName,
  type: 'SELECT',
  stepOutputKey: `{{trigger.properties.after.${fieldName}}}`,
  operand: ViewFilterOperand.IS,
  value,
  stepFilterGroupId: 'group',
});

const LIVE = filter('wschatImported', 'false');
const FROM_CLIENT = filter('lastMessageFrom', '["CLIENT"]');

const databaseEvent = (
  eventName: string,
  fields: string[] | undefined,
  stepFilters: ReturnType<typeof filter>[],
) =>
  ({
    name: 'Trigger',
    type: WorkflowTriggerType.DATABASE_EVENT,
    settings: {
      eventName,
      outputSchema: {},
      fields,
      filter: { stepFilterGroups: [], stepFilters },
    },
  }) as WorkflowTrigger;

const CLIENT_WROTE = databaseEvent(
  'wschatConversation.updated',
  ['lastMessageAt'],
  [FROM_CLIENT, LIVE],
);

const plan = ({
  action = 'message',
  trigger = CLIENT_WROTE,
  steps = [],
  parentStepId,
}: {
  action?: 'message' | 'task';
  trigger?: WorkflowTrigger | null;
  steps?: WorkflowAction[];
  parentStepId?: string;
}) => planWschatStep({ action, trigger, steps, parentStepId, ...FLAT_MAPS });

const problemOf = (result: ReturnType<typeof plan>) =>
  'problem' in result ? result.problem : undefined;

describe('planWschatStep', () => {
  it('should reply to a client through the conversation person, right after the trigger', () => {
    expect(plan({})).toEqual({
      parentStepId: 'trigger',
      personIdVariable: '{{trigger.properties.after.personId}}',
    });
  });

  it('should need no lookup when the trigger record is the person', () => {
    expect(
      plan({ trigger: databaseEvent('person.created', undefined, [LIVE]) }),
    ).toEqual({ parentStepId: 'trigger' });
  });

  it('should refuse an updated trigger that watches every field', () => {
    expect(
      problemOf(
        plan({
          trigger: databaseEvent(
            'wschatConversation.updated',
            [],
            [FROM_CLIENT, LIVE],
          ),
        }),
      ),
    ).toContain('settings.fields');
  });

  it('should refuse a reply to the last message that would answer its own reply', () => {
    expect(
      problemOf(
        plan({
          trigger: databaseEvent(
            'wschatConversation.updated',
            ['lastMessageAt'],
            [LIVE, filter('lastMessageFrom', '["EMPLOYEE"]')],
          ),
        }),
      ),
    ).toContain('lastMessageFrom IS CLIENT');
  });

  it('should refuse a trigger that history loaded into the CRM would fire', () => {
    expect(
      problemOf(
        plan({
          trigger: databaseEvent('person.created', undefined, []),
        }),
      ),
    ).toContain('wschatImported IS "false"');
  });

  it('should refuse a WSChat task started by a task, which comes back as a task', () => {
    expect(
      problemOf(
        plan({
          action: 'task',
          trigger: databaseEvent('task.created', undefined, [LIVE]),
        }),
      ),
    ).toContain('cannot follow a task trigger');
  });

  it('should refuse triggers without a record or with a repeated sync', () => {
    expect(problemOf(plan({ trigger: null }))).toContain(
      'Set the trigger first',
    );
    expect(
      problemOf(
        plan({
          trigger: {
            name: 'Every day',
            type: WorkflowTriggerType.CRON,
            settings: {
              type: 'CUSTOM',
              pattern: '0 9 * * *',
              outputSchema: {},
            },
          },
        }),
      ),
    ).toContain('Set the trigger first');
    expect(
      problemOf(
        plan({
          trigger: databaseEvent('person.upserted', ['name'], [LIVE]),
        }),
      ),
    ).toContain('"upserted" fires on every repeated sync');
  });

  it('should refuse a record with no client to reach', () => {
    expect(
      problemOf(
        plan({ trigger: databaseEvent('company.created', undefined, [LIVE]) }),
      ),
    ).toContain('no single link to a person');
  });

  it('should go after the only last step, and ask where when there are several', () => {
    const step = (id: string, nextStepIds?: string[]) =>
      ({ id, nextStepIds }) as WorkflowAction;

    expect(plan({ steps: [step('a', ['b']), step('b')] })).toEqual(
      expect.objectContaining({ parentStepId: 'b' }),
    );
    expect(
      problemOf(plan({ steps: [step('a', ['b', 'c']), step('b'), step('c')] })),
    ).toContain('pass parentStepId');
    expect(problemOf(plan({ steps: [step('a')], parentStepId: 'x' }))).toBe(
      'Step "x" is not in this workflow version.',
    );
  });
});
