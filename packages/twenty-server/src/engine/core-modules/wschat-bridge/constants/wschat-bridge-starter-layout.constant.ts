import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-shared/types';

import {
  WSCHAT_BRIDGE_CALL_OBJECT,
  WSCHAT_BRIDGE_CONVERSATION_OBJECT,
  type WschatBridgeLocalizedText,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';

// Workspace-level core.keyValuePair row (CONFIG_VARIABLE): the highest layout version already applied
export const WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION_KEY =
  'WSCHAT_STARTER_LAYOUT_VERSION';

// Raise it with new views tagged with the new number; a workspace only gets views newer than what it has
export const WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION = 2;

export type WschatBridgeStarterLayoutKeyValueTypesMap = {
  [WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION_KEY]: number;
};

export type WschatBridgeStandardOptionLabels = {
  reportName: string;
  fieldUniversalIdentifier: string;
  // `factory`: the label upstream ships; only an option still reading it is relabelled
  options: {
    value: string;
    factory: string;
    label: WschatBridgeLocalizedText;
  }[];
};

const label = (value: string, factory: string, ru: string) => ({
  value,
  factory,
  label: { en: factory, ru },
});

export const WSCHAT_BRIDGE_STANDARD_OPTION_LABELS: WschatBridgeStandardOptionLabels[] =
  [
    {
      reportName: 'task.status',
      fieldUniversalIdentifier:
        STANDARD_OBJECTS.task.fields.status.universalIdentifier,
      options: [
        label('TODO', 'To do', 'Открыта'),
        label('IN_PROGRESS', 'In progress', 'В работе'),
        label('DONE', 'Done', 'Выполнена'),
      ],
    },
    {
      reportName: 'opportunity.stage',
      fieldUniversalIdentifier:
        STANDARD_OBJECTS.opportunity.fields.stage.universalIdentifier,
      options: [
        label('NEW', 'New', 'Новая'),
        label('SCREENING', 'Screening', 'Квалификация'),
        label('MEETING', 'Meeting', 'Встреча'),
        label('PROPOSAL', 'Proposal', 'Предложение'),
        label('CUSTOMER', 'Customer', 'Клиент'),
      ],
    },
  ];

export type WschatBridgeStarterViewDefinition = {
  universalIdentifier: string;
  version: number;
  reportName: string;
  objectUniversalIdentifier: string;
  name: WschatBridgeLocalizedText;
  icon: string;
  type: ViewType.TABLE | ViewType.KANBAN;
  // Upstream views of these objects sit at 0, 1, 2…; -1 lists ours first
  position: number;
  groupByFieldName?: string;
  // By field name; the object's label identifier must come first
  fieldNames: string[];
  filter?: { fieldName: string; operand: ViewFilterOperand; values: string[] };
  sort?: { fieldName: string; direction: ViewSortDirection };
};

export const WSCHAT_BRIDGE_STARTER_VIEWS: WschatBridgeStarterViewDefinition[] =
  [
    {
      universalIdentifier: 'de8e64a7-4248-4dd1-a6ca-b7e803a16238',
      version: 1,
      reportName: 'task.byType',
      objectUniversalIdentifier: STANDARD_OBJECTS.task.universalIdentifier,
      name: { en: 'By type', ru: 'По типу' },
      icon: 'IconLayoutKanban',
      type: ViewType.KANBAN,
      position: -1,
      groupByFieldName: 'wschatType',
      fieldNames: ['title', 'status', 'dueAt', 'assignee'],
    },
    {
      universalIdentifier: '00b33a1f-9f87-4d0e-9ac4-3bb709544e8e',
      version: 1,
      reportName: 'wschatConversation.open',
      objectUniversalIdentifier:
        WSCHAT_BRIDGE_CONVERSATION_OBJECT.universalIdentifier,
      name: { en: 'Open', ru: 'Открытые' },
      icon: 'IconMessageCircle',
      type: ViewType.TABLE,
      position: 1,
      fieldNames: [
        'name',
        'person',
        'channel',
        'responsible',
        'lastMessageAt',
        'lastMessageFrom',
        'startedAt',
        'wschatUrl',
      ],
      filter: {
        fieldName: 'state',
        operand: ViewFilterOperand.IS,
        values: ['OPEN'],
      },
      sort: { fieldName: 'lastMessageAt', direction: ViewSortDirection.DESC },
    },
    {
      universalIdentifier: 'd9dd10c0-900a-44d0-89f9-666c1edf8ddc',
      version: 1,
      reportName: 'wschatConversation.byOutcome',
      objectUniversalIdentifier:
        WSCHAT_BRIDGE_CONVERSATION_OBJECT.universalIdentifier,
      name: { en: 'By outcome', ru: 'По итогам' },
      icon: 'IconLayoutKanban',
      type: ViewType.KANBAN,
      position: 2,
      groupByFieldName: 'outcome',
      fieldNames: ['name', 'person', 'channel', 'responsible', 'closedAt'],
    },
    {
      universalIdentifier: '1c17ea07-820d-4b98-b872-07b9861a6408',
      version: 1,
      reportName: 'wschatCall.missed',
      objectUniversalIdentifier: WSCHAT_BRIDGE_CALL_OBJECT.universalIdentifier,
      name: { en: 'Missed', ru: 'Пропущенные' },
      icon: 'IconPhoneOff',
      type: ViewType.TABLE,
      position: 1,
      fieldNames: [
        'name',
        'person',
        'channel',
        'direction',
        'startedAt',
        'answeredBy',
        'wschatUrl',
      ],
      filter: {
        fieldName: 'status',
        operand: ViewFilterOperand.IS,
        values: ['MISSED'],
      },
      sort: { fieldName: 'startedAt', direction: ViewSortDirection.DESC },
    },
  ];

// The object's main (INDEX) view: `reshape` renames it and sets its columns only while untouched,
// `append` adds missing columns at its end and leaves the rest alone
export type WschatBridgeIndexViewDefinition = {
  version: number;
  reportName: string;
  objectUniversalIdentifier: string;
  mode: 'reshape' | 'append';
  name?: WschatBridgeLocalizedText;
  fieldNames: string[];
};

export const WSCHAT_BRIDGE_INDEX_VIEWS: WschatBridgeIndexViewDefinition[] = [
  {
    version: 2,
    reportName: 'wschatConversation.index',
    objectUniversalIdentifier:
      WSCHAT_BRIDGE_CONVERSATION_OBJECT.universalIdentifier,
    mode: 'reshape',
    name: { en: 'All conversations', ru: 'Все обращения' },
    fieldNames: [
      'name',
      'person',
      'channel',
      'state',
      'outcome',
      'responsible',
      'lastMessageAt',
      'lastMessageFrom',
      'startedAt',
      'wschatUrl',
    ],
  },
  {
    version: 2,
    reportName: 'wschatCall.index',
    objectUniversalIdentifier: WSCHAT_BRIDGE_CALL_OBJECT.universalIdentifier,
    mode: 'reshape',
    name: { en: 'All calls', ru: 'Все звонки' },
    fieldNames: [
      'name',
      'person',
      'direction',
      'status',
      'channel',
      'startedAt',
      'durationSeconds',
      'answeredBy',
      'outcome',
      'summary',
      'wschatUrl',
    ],
  },
  {
    version: 2,
    reportName: 'person.index',
    objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
    mode: 'append',
    fieldNames: ['wschatLastContactAt', 'wschatLastChannel', 'wschatUrl'],
  },
  {
    version: 2,
    reportName: 'company.index',
    objectUniversalIdentifier: STANDARD_OBJECTS.company.universalIdentifier,
    mode: 'append',
    fieldNames: ['wschatPhones', 'wschatUrl'],
  },
];
