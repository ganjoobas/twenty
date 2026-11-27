import { type WorkflowManifest } from 'twenty-shared/application';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { StepLogicalOperator, ViewFilterOperand } from 'twenty-shared/types';

import {
  WSCHAT_BRIDGE_CALL_OBJECT,
  WSCHAT_BRIDGE_CONVERSATION_OBJECT,
  WSCHAT_BRIDGE_FIELDS,
  type WschatBridgeLocale,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';

export type WschatBridgeSampleActionWorkflow = {
  reportName: string;
  name: string;
  manifest: WorkflowManifest;
};

const PERSON = STANDARD_OBJECTS.person;
const CALL = WSCHAT_BRIDGE_CALL_OBJECT.universalIdentifier;
const CONVERSATION = WSCHAT_BRIDGE_CONVERSATION_OBJECT.universalIdentifier;

const fieldUniversalIdentifier = (
  objectUniversalIdentifier: string,
  name: string,
): string => {
  const definition = WSCHAT_BRIDGE_FIELDS.find(
    (field) =>
      field.objectUniversalIdentifier === objectUniversalIdentifier &&
      field.name === name,
  );

  if (definition === undefined) {
    throw new Error(`No WSChat field ${name} on ${objectUniversalIdentifier}`);
  }

  return definition.universalIdentifier;
};

// Shared by the samples and the AI chat's WSChat step tool
export const WSCHAT_STEP_NAMES = {
  findClient: { en: 'Find the client', ru: 'Найти клиента' },
  sendMessage: {
    en: 'Send a message from WSChat',
    ru: 'Отправить сообщение из WSChat',
  },
  createTask: { en: 'Create a task in WSChat', ru: 'Создать задачу в WSChat' },
  forEachClient: { en: 'For each client', ru: 'Для каждого клиента' },
} as const;

const TEXTS = {
  missedCall: {
    name: {
      en: 'Missed call → "Call back" task in WSChat',
      ru: 'Пропущенный звонок → задача «Перезвонить» в WSChat',
    },
    trigger: {
      en: 'A missed call is recorded',
      ru: 'Записан пропущенный звонок',
    },
    findPerson: { en: 'Find the caller', ru: 'Найти звонившего' },
    action: WSCHAT_STEP_NAMES.createTask,
    title: { en: 'Call back: ', ru: 'Перезвонить: ' },
  },
  closedConversation: {
    name: {
      en: 'Conversation closed successfully → message to the client',
      ru: 'Обращение закрыто успешно → сообщение клиенту',
    },
    trigger: {
      en: 'A conversation is closed with a success',
      ru: 'Обращение закрыто с успешным итогом',
    },
    findPerson: WSCHAT_STEP_NAMES.findClient,
    action: WSCHAT_STEP_NAMES.sendMessage,
    text: {
      en: 'Thank you for contacting us! If you have any questions, just write to us.',
      ru: 'Спасибо за обращение! Если появятся вопросы — напишите нам.',
    },
  },
  reminder: {
    name: {
      en: 'Scheduled reminder to clients',
      ru: 'Напоминание клиенту по расписанию',
    },
    trigger: {
      en: '1st of each month, 04:00 UTC (10:00 in Bishkek)',
      ru: '1-го числа каждого месяца, 04:00 UTC (10:00 по Бишкеку)',
    },
    findPeople: {
      en: 'SET UP: which clients to remind (matches nobody yet). Sending is limited per day by the channel',
      ru: 'НАСТРОЙТЕ: кому напомнить (сейчас не выбирает никого). Отправка идёт с дневными пределами канала',
    },
    loop: WSCHAT_STEP_NAMES.forEachClient,
    action: WSCHAT_STEP_NAMES.sendMessage,
    text: {
      en: 'Hello! A reminder from us: …',
      ru: 'Здравствуйте! Напоминаем: …',
    },
  },
} as const;

// Fixed within a version; workflow and step rows get their own ids from upstream
const IDS = {
  missedCall: {
    workflow: '47d25907-7dfe-4f0e-aa90-1e02900040f0',
    trigger: 'a77cb661-fdf1-4fa8-a076-079a60f5b5a9',
    filterGroup: 'f473f9f2-3301-4ef7-8324-eedcf37c3457',
    findPerson: '84b23e57-6b23-4bfa-a811-6fc91ca0d6ed',
    action: '04850d32-0032-4476-b45e-84ac4cd56c54',
  },
  closedConversation: {
    workflow: '478b9287-6d4a-4f79-af87-b51c17d97411',
    trigger: 'c5f443f8-01ac-4755-9c0a-e38117762e77',
    filterGroup: 'd461dc16-6a72-4f5b-93e4-a758ed4c7e94',
    findPerson: '39c5a36f-4f2f-4217-a7a0-e001ce851af2',
    action: '6f8825cb-91ec-47c0-a97a-2dce1c776365',
  },
  reminder: {
    workflow: '3e08d55a-1ede-4282-8491-a2be6cfc4f5c',
    trigger: '10029765-3895-4438-a3e8-d8ab28a30648',
    findPeople: '26c74424-5d87-40ae-acc3-8440c519981e',
    loop: '176e5017-2f8c-45c9-8a96-13ab48cbebfe',
    action: '70228548-6fe5-481e-8ec8-a6b5f1e29936',
  },
} as const;

const FILTER_IDS = [
  '112fdf79-9e39-428a-9222-1f89032e24b6',
  'e1a6b5a8-36c4-4a5f-9b1e-0a3c7d2f5e61',
  '5b7c9d1e-2f3a-4b6c-8d9e-1a2b3c4d5e6f',
  '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
] as const;

export const buildWschatActionUrl = (
  actionsUrl: string,
  path: '/messages' | '/tasks',
): string => `${actionsUrl.replace(/\/+$/, '')}${path}`;

// No Authorization: the HTTP step adds the stored token when it calls this endpoint (README, "WSChat token")
export const httpStep = ({
  universalIdentifier,
  name,
  nextStepIds,
  actionsUrl,
  path,
  body,
}: {
  universalIdentifier: string;
  name: string;
  nextStepIds: string[];
  actionsUrl: string;
  path: '/messages' | '/tasks';
  body: Record<string, string>;
}): WorkflowManifest['version']['steps'][number] => ({
  universalIdentifier,
  name,
  type: 'HTTP_REQUEST',
  nextStepIds,
  input: {
    url: buildWschatActionUrl(actionsUrl, path),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  },
});

export const findPersonStep = ({
  universalIdentifier,
  name,
  nextStepIds,
  filterId,
  personIdVariable = '{{trigger.properties.after.personId}}',
}: {
  universalIdentifier: string;
  name: string;
  nextStepIds: string[];
  filterId: string;
  personIdVariable?: string;
}): WorkflowManifest['version']['steps'][number] => ({
  universalIdentifier,
  name,
  type: 'FIND_RECORDS',
  nextStepIds,
  input: {
    objectUniversalIdentifier: PERSON.universalIdentifier,
    limit: 1,
    filter: {
      recordFilters: [
        {
          id: filterId,
          fieldMetadataUniversalIdentifier:
            PERSON.fields.id.universalIdentifier,
          operand: ViewFilterOperand.IS,
          value: `["${personIdVariable}"]`,
        },
      ],
    },
  },
});

// Shared trigger conditions: not loaded from history, linked to a person
const liveRecordWithPersonFilters = ({
  objectUniversalIdentifier,
  filterGroupId,
}: {
  objectUniversalIdentifier: string;
  filterGroupId: string;
}) => [
  {
    id: FILTER_IDS[0],
    type: 'BOOLEAN',
    stepOutputKey: '{{trigger.properties.after.wschatImported}}',
    operand: ViewFilterOperand.IS,
    value: 'false',
    stepFilterGroupId: filterGroupId,
    positionInStepFilterGroup: 0,
    fieldMetadataUniversalIdentifier: fieldUniversalIdentifier(
      objectUniversalIdentifier,
      'wschatImported',
    ),
  },
  {
    id: FILTER_IDS[1],
    type: 'UUID',
    stepOutputKey: '{{trigger.properties.after.personId}}',
    operand: ViewFilterOperand.IS_NOT_EMPTY,
    value: '',
    stepFilterGroupId: filterGroupId,
    positionInStepFilterGroup: 1,
  },
];

// Same record and same change: same key, so a retried step does nothing twice; a new change gets a new key
const TRIGGER_RECORD_KEY =
  '{{trigger.properties.after.id}}:{{trigger.properties.after.updatedAt}}';

// Three switched-off samples acting in WSChat through its actions endpoint (README, "Sample action workflows")
export const buildSampleActionWorkflows = ({
  actionsUrl,
  locale,
}: {
  actionsUrl: string;
  locale: WschatBridgeLocale;
}): WschatBridgeSampleActionWorkflow[] => {
  const missed = IDS.missedCall;
  const closed = IDS.closedConversation;
  const reminder = IDS.reminder;

  return [
    {
      reportName: 'workflowSample.missedCallTask',
      name: TEXTS.missedCall.name[locale],
      manifest: {
        universalIdentifier: missed.workflow,
        name: TEXTS.missedCall.name[locale],
        version: {
          // created only: an upsert that inserts carries no updated fields, and re-syncs must not fire it again
          trigger: {
            universalIdentifier: missed.trigger,
            name: TEXTS.missedCall.trigger[locale],
            type: 'DATABASE_EVENT',
            nextStepIds: [missed.findPerson],
            settings: {
              objectUniversalIdentifier: CALL,
              action: 'created',
              filter: {
                stepFilterGroups: [
                  {
                    id: missed.filterGroup,
                    logicalOperator: StepLogicalOperator.AND,
                  },
                ],
                stepFilters: [
                  {
                    id: FILTER_IDS[2],
                    type: 'SELECT',
                    stepOutputKey: '{{trigger.properties.after.status}}',
                    operand: ViewFilterOperand.IS,
                    value: '["MISSED"]',
                    stepFilterGroupId: missed.filterGroup,
                    positionInStepFilterGroup: 2,
                    fieldMetadataUniversalIdentifier: fieldUniversalIdentifier(
                      CALL,
                      'status',
                    ),
                  },
                  ...liveRecordWithPersonFilters({
                    objectUniversalIdentifier: CALL,
                    filterGroupId: missed.filterGroup,
                  }),
                ],
              },
            },
          },
          steps: [
            findPersonStep({
              universalIdentifier: missed.findPerson,
              name: TEXTS.missedCall.findPerson[locale],
              nextStepIds: [missed.action],
              filterId: FILTER_IDS[3],
            }),
            httpStep({
              universalIdentifier: missed.action,
              name: TEXTS.missedCall.action[locale],
              nextStepIds: [],
              actionsUrl,
              path: '/tasks',
              body: {
                contact: `{{${missed.findPerson}.first.wschatContactId}}`,
                title: `${TEXTS.missedCall.title[locale]}{{${missed.findPerson}.first.name.firstName}} {{${missed.findPerson}.first.name.lastName}}`,
                key: `missed-call:${TRIGGER_RECORD_KEY}`,
              },
            }),
          ],
        },
      },
    },
    {
      reportName: 'workflowSample.closedConversationMessage',
      name: TEXTS.closedConversation.name[locale],
      manifest: {
        universalIdentifier: closed.workflow,
        name: TEXTS.closedConversation.name[locale],
        version: {
          // Watches state and outcome tone only: WSChat's own later updates (last message) start nothing
          trigger: {
            universalIdentifier: closed.trigger,
            name: TEXTS.closedConversation.trigger[locale],
            type: 'DATABASE_EVENT',
            nextStepIds: [closed.findPerson],
            settings: {
              objectUniversalIdentifier: CONVERSATION,
              action: 'updated',
              fieldUniversalIdentifiers: [
                fieldUniversalIdentifier(CONVERSATION, 'state'),
                fieldUniversalIdentifier(CONVERSATION, 'outcomeTone'),
              ],
              filter: {
                stepFilterGroups: [
                  {
                    id: closed.filterGroup,
                    logicalOperator: StepLogicalOperator.AND,
                  },
                ],
                stepFilters: [
                  {
                    id: FILTER_IDS[2],
                    type: 'SELECT',
                    stepOutputKey: '{{trigger.properties.after.state}}',
                    operand: ViewFilterOperand.IS,
                    value: '["CLOSED"]',
                    stepFilterGroupId: closed.filterGroup,
                    positionInStepFilterGroup: 2,
                    fieldMetadataUniversalIdentifier: fieldUniversalIdentifier(
                      CONVERSATION,
                      'state',
                    ),
                  },
                  {
                    id: FILTER_IDS[3],
                    type: 'SELECT',
                    stepOutputKey: '{{trigger.properties.after.outcomeTone}}',
                    operand: ViewFilterOperand.IS,
                    value: '["SUCCESS"]',
                    stepFilterGroupId: closed.filterGroup,
                    positionInStepFilterGroup: 3,
                    fieldMetadataUniversalIdentifier: fieldUniversalIdentifier(
                      CONVERSATION,
                      'outcomeTone',
                    ),
                  },
                  ...liveRecordWithPersonFilters({
                    objectUniversalIdentifier: CONVERSATION,
                    filterGroupId: closed.filterGroup,
                  }),
                ],
              },
            },
          },
          steps: [
            findPersonStep({
              universalIdentifier: closed.findPerson,
              name: TEXTS.closedConversation.findPerson[locale],
              nextStepIds: [closed.action],
              filterId: '0430c392-f553-4fb2-8082-12d9faa78507',
            }),
            httpStep({
              universalIdentifier: closed.action,
              name: TEXTS.closedConversation.action[locale],
              nextStepIds: [],
              actionsUrl,
              path: '/messages',
              body: {
                contact: `{{${closed.findPerson}.first.wschatContactId}}`,
                text: TEXTS.closedConversation.text[locale],
                channel: 'last',
                key: `closed-conversation:${TRIGGER_RECORD_KEY}`,
              },
            }),
          ],
        },
      },
    },
    {
      reportName: 'workflowSample.scheduledReminder',
      name: TEXTS.reminder.name[locale],
      manifest: {
        universalIdentifier: reminder.workflow,
        name: TEXTS.reminder.name[locale],
        version: {
          // Cron runs in the server's time zone (cron-parser without tz in CronTriggerDeduplicationService)
          trigger: {
            universalIdentifier: reminder.trigger,
            name: TEXTS.reminder.trigger[locale],
            type: 'CRON',
            nextStepIds: [reminder.findPeople],
            settings: { type: 'CUSTOM', pattern: '0 4 1 * *' },
          },
          steps: [
            {
              universalIdentifier: reminder.findPeople,
              name: TEXTS.reminder.findPeople[locale],
              type: 'FIND_RECORDS',
              nextStepIds: [reminder.loop],
              input: {
                objectUniversalIdentifier: PERSON.universalIdentifier,
                limit: 50,
                filter: {
                  recordFilters: [
                    {
                      id: FILTER_IDS[1],
                      fieldMetadataUniversalIdentifier:
                        fieldUniversalIdentifier(
                          PERSON.universalIdentifier,
                          'wschatContactId',
                        ),
                      operand: ViewFilterOperand.CONTAINS,
                      value: 'SET-UP-THIS-CONDITION',
                    },
                  ],
                },
              },
            },
            {
              universalIdentifier: reminder.loop,
              name: TEXTS.reminder.loop[locale],
              type: 'ITERATOR',
              nextStepIds: [],
              input: {
                items: `{{${reminder.findPeople}.all}}`,
                initialLoopStepIds: [reminder.action],
              },
            },
            // Back to the iterator, or the loop would run once
            httpStep({
              universalIdentifier: reminder.action,
              name: TEXTS.reminder.action[locale],
              nextStepIds: [reminder.loop],
              actionsUrl,
              path: '/messages',
              body: {
                contact: `{{${reminder.loop}.currentItem.wschatContactId}}`,
                text: TEXTS.reminder.text[locale],
                channel: 'last',
                key: `reminder:{{${reminder.loop}.currentItem.id}}:{{${reminder.loop}.currentItem.updatedAt}}`,
              },
            }),
          ],
        },
      },
    },
  ];
};
