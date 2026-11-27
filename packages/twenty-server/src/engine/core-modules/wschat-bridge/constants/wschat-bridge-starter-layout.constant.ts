import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-shared/types';

import {
  WSCHAT_BRIDGE_CALL_OBJECT,
  WSCHAT_BRIDGE_CONVERSATION_OBJECT,
  WSCHAT_BRIDGE_ICON,
  type WschatBridgeLocalizedText,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';

// Workspace-level core.keyValuePair row (CONFIG_VARIABLE): the highest layout version already applied
export const WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION_KEY =
  'WSCHAT_STARTER_LAYOUT_VERSION';

// Raise it with new views tagged with the new number; a workspace only gets views newer than what it has
export const WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION = 7;

// Version that switches off upstream's sample workflows (WschatBridgeSampleWorkflowsService)
export const WSCHAT_BRIDGE_SAMPLE_WORKFLOWS_LAYOUT_VERSION = 3;

// Version that adds the switched-off samples acting in WSChat; needs `actions` in the request
export const WSCHAT_BRIDGE_SAMPLE_ACTIONS_LAYOUT_VERSION = 4;

// Version that gives existing fields their new icon; new workspaces get it from the field definition
export const WSCHAT_BRIDGE_FIELD_ICONS_LAYOUT_VERSION = 7;

export type WschatBridgeFieldIconDefinition = {
  reportName: string;
  fieldUniversalIdentifier: string;
  // Only a field still showing the icon it was created with is changed
  factory: string;
  icon: string;
};

export const WSCHAT_BRIDGE_FIELD_ICONS: WschatBridgeFieldIconDefinition[] = [
  {
    reportName: 'task.wschatShow',
    fieldUniversalIdentifier: '64300b05-7c47-4a9e-a723-48a1d9225e0b',
    factory: 'IconMessageShare',
    icon: WSCHAT_BRIDGE_ICON,
  },
];

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
  // Upstream views sit at 0 (INDEX), 1 (initial view of custom objects), 2…; -1 lists ours first
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
      position: 2,
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
      position: 3,
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
      position: 2,
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
  // index: the INDEX view (what people see on standard objects); initial: the view createOneObject adds to a
  // custom object, which the app opens first, as the first non-INDEX view by position
  view: 'index' | 'initial' | 'starter';
  // view: 'starter' only: one of WSCHAT_BRIDGE_STARTER_VIEWS
  viewUniversalIdentifier?: string;
  name?: WschatBridgeLocalizedText;
  position?: number;
  fieldNames: string[];
  // Also puts back the INDEX view version 2 reshaped with these same names and columns
  revertsIndexAs?: string;
};

// Columns of the initial view of a custom object as upstream creates it (computeInitialObjectViewFieldsToCreate)
export const WSCHAT_BRIDGE_INITIAL_VIEW_FIELD_NAMES = [
  'name',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
];

const CONVERSATION_MAIN_FIELDS = [
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
];

const CALL_MAIN_FIELDS = [
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
];

export const WSCHAT_BRIDGE_INDEX_VIEWS: WschatBridgeIndexViewDefinition[] = [
  // Version 2 also reshaped the INDEX views of conversations and calls; workspaces created since skip that,
  // as the app opens the initial view (version 5)
  {
    version: 2,
    reportName: 'person.index',
    objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
    mode: 'append',
    view: 'index',
    fieldNames: ['wschatLastContactAt', 'wschatLastChannel', 'wschatUrl'],
  },
  {
    version: 2,
    reportName: 'company.index',
    objectUniversalIdentifier: STANDARD_OBJECTS.company.universalIdentifier,
    mode: 'append',
    view: 'index',
    fieldNames: ['wschatPhones', 'wschatUrl'],
  },
  {
    version: 5,
    reportName: 'wschatConversation.main',
    revertsIndexAs: 'wschatConversation.index',
    objectUniversalIdentifier:
      WSCHAT_BRIDGE_CONVERSATION_OBJECT.universalIdentifier,
    mode: 'reshape',
    view: 'initial',
    name: { en: 'All conversations', ru: 'Все обращения' },
    position: 0,
    fieldNames: CONVERSATION_MAIN_FIELDS,
  },
  {
    version: 5,
    reportName: 'wschatCall.main',
    revertsIndexAs: 'wschatCall.index',
    objectUniversalIdentifier: WSCHAT_BRIDGE_CALL_OBJECT.universalIdentifier,
    mode: 'reshape',
    view: 'initial',
    name: { en: 'All calls', ru: 'Все звонки' },
    position: 0,
    fieldNames: CALL_MAIN_FIELDS,
  },
  // The "Show in WSChat" tick where people set tasks up: the INDEX table and our board, which opens first
  {
    version: 6,
    reportName: 'task.index',
    objectUniversalIdentifier: STANDARD_OBJECTS.task.universalIdentifier,
    mode: 'append',
    view: 'index',
    fieldNames: ['wschatShow'],
  },
  {
    version: 6,
    reportName: 'task.byType.show',
    objectUniversalIdentifier: STANDARD_OBJECTS.task.universalIdentifier,
    mode: 'append',
    view: 'starter',
    viewUniversalIdentifier: 'de8e64a7-4248-4dd1-a6ca-b7e803a16238',
    fieldNames: ['wschatShow'],
  },
];
