import {
  FieldMetadataType,
  RelationType,
  StepLogicalOperator,
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
const OPPORTUNITY = 'object-opportunity';

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
    { id: OPPORTUNITY, nameSingular: 'opportunity' },
  ]),
  flatFieldMetadataMaps: byUniversalIdentifier([
    field(PERSON, 'wschatImported'),
    field(CONVERSATION, 'wschatImported'),
    relationToPerson(CONVERSATION, 'person'),
    field(TASK, 'wschatImported'),
    field(COMPANY, 'wschatImported'),
    relationToPerson(OPPORTUNITY, 'pointOfContact'),
  ]),
};

type Filter = ReturnType<typeof filter>;

const filter = (fieldName: string, value: string, stepFilterGroupId = 'g') => ({
  id: fieldName,
  type: 'SELECT',
  stepOutputKey: `{{trigger.properties.after.${fieldName}}}`,
  operand: ViewFilterOperand.IS,
  value,
  stepFilterGroupId,
});

const LIVE = filter('wschatImported', 'false');
const FROM_CLIENT = filter('lastMessageFrom', '["CLIENT"]');
const AND_GROUP = { id: 'g', logicalOperator: StepLogicalOperator.AND };

const databaseEvent = (
  eventName: string,
  fields: string[] | undefined,
  stepFilters: Filter[],
  stepFilterGroups = [AND_GROUP],
) =>
  ({
    name: 'Trigger',
    type: WorkflowTriggerType.DATABASE_EVENT,
    settings: {
      eventName,
      outputSchema: {},
      fields,
      filter: { stepFilterGroups, stepFilters },
    },
  }) as WorkflowTrigger;

const CLIENT_WROTE = databaseEvent(
  'wschatConversation.updated',
  ['lastMessageAt'],
  [FROM_CLIENT],
);

const step = (id: string, overrides: Record<string, unknown> = {}) =>
  ({
    id,
    name: id,
    type: 'CODE',
    nextStepIds: [],
    ...overrides,
  }) as unknown as WorkflowAction;

const plan = ({
  action = 'message',
  trigger = CLIENT_WROTE,
  steps = [],
  parentStepId,
  branchId,
  forEachRecordOf,
}: {
  action?: 'message' | 'task';
  trigger?: WorkflowTrigger | null;
  steps?: WorkflowAction[];
  parentStepId?: string;
  branchId?: string;
  forEachRecordOf?: string;
}) =>
  planWschatStep({
    action,
    trigger,
    steps,
    parentStepId,
    branchId,
    forEachRecordOf,
    ...FLAT_MAPS,
  });

const problemOf = (result: ReturnType<typeof plan>) =>
  'problem' in result ? result.problem : undefined;

describe('planWschatStep', () => {
  it('should reply to a client of an existing conversation, imported or not, right after the trigger', () => {
    expect(plan({})).toEqual({
      source: { kind: 'record', variable: 'trigger.properties.after' },
      personJoinColumn: 'personId',
      placement: { parentStepId: 'trigger', nextStepId: undefined },
    });
  });

  it('should refuse an updated trigger that watches every field', () => {
    expect(
      problemOf(
        plan({
          trigger: databaseEvent(
            'wschatConversation.updated',
            [],
            [FROM_CLIENT],
          ),
        }),
      ),
    ).toContain('settings.fields');
  });

  it('should accept only a binding "from the client" filter on the last message', () => {
    const replyWith = (filters: Filter[], groups = [AND_GROUP]) =>
      problemOf(
        plan({
          trigger: databaseEvent(
            'wschatConversation.updated',
            ['lastMessageAt'],
            filters,
            groups,
          ),
        }),
      );

    expect(replyWith([])).toContain('lastMessageFrom IS ["CLIENT"]');
    expect(
      replyWith([filter('lastMessageFrom', '["CLIENT","EMPLOYEE"]')]),
    ).toBeDefined();
    expect(
      replyWith(
        [FROM_CLIENT],
        [{ id: 'g', logicalOperator: StepLogicalOperator.OR }],
      ),
    ).toBeDefined();
    expect(
      replyWith(
        [filter('lastMessageFrom', '["CLIENT"]', 'child')],
        [
          { id: 'g', logicalOperator: StepLogicalOperator.OR },
          {
            id: 'child',
            logicalOperator: StepLogicalOperator.AND,
            parentStepFilterGroupId: 'g',
          } as never,
        ],
      ),
    ).toBeDefined();
    expect(
      replyWith([filter('lastMessageFrom', '["CLIENT"]', 'gone')]),
    ).toBeDefined();
    expect(
      replyWith(
        [filter('lastMessageFrom', '["CLIENT"]', 'child')],
        [
          AND_GROUP,
          {
            id: 'child',
            logicalOperator: StepLogicalOperator.AND,
            parentStepFilterGroupId: 'g',
          } as never,
        ],
      ),
    ).toBeUndefined();
    expect(replyWith([FROM_CLIENT], [])).toBeUndefined();
  });

  it('should require the client filter on new conversations too, for messages only', () => {
    const conversationCreated = (stepFilters: Filter[]) =>
      databaseEvent('wschatConversation.created', undefined, stepFilters);

    expect(problemOf(plan({ trigger: conversationCreated([LIVE]) }))).toContain(
      'lastMessageFrom IS ["CLIENT"]',
    );
    expect(
      problemOf(plan({ trigger: conversationCreated([LIVE, FROM_CLIENT]) })),
    ).toBeUndefined();
    expect(
      problemOf(plan({ action: 'task', trigger: conversationCreated([LIVE]) })),
    ).toBeUndefined();
  });

  it('should require the history filter on created records of WSChat objects only', () => {
    expect(
      problemOf(
        plan({ trigger: databaseEvent('person.created', undefined, []) }),
      ),
    ).toContain('wschatImported IS "false"');
    expect(
      plan({ trigger: databaseEvent('person.created', undefined, [LIVE]) }),
    ).toEqual(expect.objectContaining({ personJoinColumn: undefined }));
    expect(
      plan({ trigger: databaseEvent('opportunity.created', undefined, []) }),
    ).toEqual(
      expect.objectContaining({ personJoinColumn: 'pointOfContactId' }),
    );
  });

  it('should refuse person changes that the step its own message can cause', () => {
    const personUpdated = databaseEvent(
      'person.updated',
      ['wschatLastContactAt'],
      [],
    );

    expect(problemOf(plan({ trigger: personUpdated }))).toContain(
      'wschatLastContactAt',
    );
    expect(
      problemOf(plan({ action: 'task', trigger: personUpdated })),
    ).toBeUndefined();
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

  it('should refuse missing triggers, repeated syncs and records with no client', () => {
    expect(problemOf(plan({ trigger: null }))).toBe('Set the trigger first.');
    expect(
      problemOf(
        plan({ trigger: databaseEvent('person.upserted', ['name'], []) }),
      ),
    ).toContain('"upserted" fires on every repeated sync');
    expect(
      problemOf(
        plan({ trigger: databaseEvent('company.created', undefined, [LIVE]) }),
      ),
    ).toContain('no single link to a person');
  });

  it('should take the record of a manual trigger run on one conversation', () => {
    expect(
      plan({
        trigger: {
          name: 'Write to the client',
          type: WorkflowTriggerType.MANUAL,
          settings: {
            outputSchema: {},
            availability: {
              type: 'SINGLE_RECORD',
              objectNameSingular: 'wschatConversation',
            },
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        source: { kind: 'record', variable: 'trigger.payload' },
        personJoinColumn: 'personId',
      }),
    );
  });

  it('should loop over the people a scheduled workflow finds, and need them for a schedule', () => {
    const cron = {
      name: 'Every month',
      type: WorkflowTriggerType.CRON,
      settings: { type: 'CUSTOM', pattern: '0 4 1 * *', outputSchema: {} },
    } as WorkflowTrigger;
    const findPeople = step('find-people', {
      type: 'FIND_RECORDS',
      settings: { input: { objectName: 'person' } },
    });

    expect(problemOf(plan({ trigger: cron }))).toContain('forEachRecordOf');
    expect(
      problemOf(
        plan({ trigger: cron, steps: [step('code')], forEachRecordOf: 'code' }),
      ),
    ).toContain('FIND_RECORDS');
    expect(
      plan({
        trigger: cron,
        steps: [findPeople],
        forEachRecordOf: 'find-people',
      }),
    ).toEqual({
      source: { kind: 'loop', items: '{{find-people.all}}' },
      personJoinColumn: undefined,
      placement: { parentStepId: 'find-people', nextStepId: undefined },
    });
  });

  it('should go after the parent and before its only next step, or ask where', () => {
    expect(
      plan({ steps: [step('a', { nextStepIds: ['b'] }), step('b')] }),
    ).toEqual(
      expect.objectContaining({
        placement: { parentStepId: 'b', nextStepId: undefined },
      }),
    );
    expect(
      plan({
        steps: [step('a', { nextStepIds: ['b'] }), step('b')],
        parentStepId: 'a',
      }),
    ).toEqual(
      expect.objectContaining({
        placement: { parentStepId: 'a', nextStepId: 'b' },
      }),
    );
    expect(problemOf(plan({ steps: [step('a'), step('b')] }))).toContain(
      'pass parentStepId',
    );
    expect(problemOf(plan({ steps: [step('a')], parentStepId: 'x' }))).toBe(
      'Step "x" is not in this workflow version.',
    );
    expect(
      problemOf(plan({ steps: [step('a')], parentStepId: 'a', branchId: 'b' })),
    ).toContain('only to an If/Else');
  });

  it('should add to one branch of an If/Else', () => {
    const ifElse = step('if', {
      type: 'IF_ELSE',
      nextStepIds: undefined,
      settings: {
        input: {
          branches: [
            { id: 'yes', nextStepIds: ['after-yes'] },
            { id: 'no', nextStepIds: [] },
          ],
        },
      },
    });
    const steps = [ifElse, step('after-yes')];

    expect(problemOf(plan({ steps, parentStepId: 'if' }))).toContain(
      '"yes", "no"',
    );
    expect(plan({ steps, parentStepId: 'if', branchId: 'yes' })).toEqual(
      expect.objectContaining({
        placement: {
          parentStepId: 'if',
          nextStepId: 'after-yes',
          parentStepConnectionOptions: {
            connectedStepType: 'IF_ELSE',
            settings: { branchId: 'yes' },
          },
        },
      }),
    );
  });
});
