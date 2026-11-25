import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FieldMetadataType, type TagColor } from 'twenty-shared/types';

export const WSCHAT_BRIDGE_LOCALES = ['en', 'ru'] as const;

export type WschatBridgeLocale = (typeof WSCHAT_BRIDGE_LOCALES)[number];

export type WschatBridgeLocalizedText = Record<WschatBridgeLocale, string>;

export type WschatBridgeObjectDefinition = {
  universalIdentifier: string;
  nameSingular: string;
  namePlural: string;
  labelSingular: WschatBridgeLocalizedText;
  labelPlural: WschatBridgeLocalizedText;
  description: string;
  icon: string;
};

export type WschatBridgeOptionDefinition = {
  value: string;
  label: WschatBridgeLocalizedText;
  color: TagColor;
};

// Per-company option lists kept in sync by PUT …/dictionaries
export const WSCHAT_BRIDGE_DICTIONARIES = ['outcomes', 'taskTypes'] as const;

export type WschatBridgeDictionary =
  (typeof WSCHAT_BRIDGE_DICTIONARIES)[number];

export type WschatBridgeFieldDefinition = {
  objectUniversalIdentifier: string;
  universalIdentifier: string;
  name: string;
  type: FieldMetadataType;
  isUnique: boolean;
  icon: string;
  label: WschatBridgeLocalizedText;
  description?: WschatBridgeLocalizedText;
  // Only for wschatImported: NOT NULL with a default, so existing rows read false and a filter "is false" works
  defaultValue?: boolean;
  // SELECT only: the options created with the field
  options?: WschatBridgeOptionDefinition[];
  // SELECT only: options managed per company afterwards
  dictionary?: WschatBridgeDictionary;
  // MANY_TO_ONE from this field's object; the reverse list's name comes from reverseLabel.en and never changes
  relation?: {
    targetObjectUniversalIdentifier: string;
    reverseLabel: WschatBridgeLocalizedText;
    reverseIcon: string;
  };
};

export const WSCHAT_BRIDGE_CONVERSATION_OBJECT: WschatBridgeObjectDefinition = {
  universalIdentifier: '9f9bbd22-096f-4bed-ac62-62d7fb588438',
  nameSingular: 'wschatConversation',
  namePlural: 'wschatConversations',
  labelSingular: { en: 'Conversation', ru: 'Обращение' },
  labelPlural: { en: 'Conversations', ru: 'Обращения' },
  description: 'One WSChat dialog, written by WSChat',
  icon: 'IconMessage',
};

export const WSCHAT_BRIDGE_CALL_OBJECT: WschatBridgeObjectDefinition = {
  universalIdentifier: 'ccb617c5-fc3e-4bc1-a3a8-05577270b172',
  nameSingular: 'wschatCall',
  namePlural: 'wschatCalls',
  labelSingular: { en: 'Call', ru: 'Звонок' },
  labelPlural: { en: 'Calls', ru: 'Звонки' },
  description: 'One call handled in WSChat, written by WSChat',
  icon: 'IconPhone',
};

export const WSCHAT_BRIDGE_OBJECTS: WschatBridgeObjectDefinition[] = [
  WSCHAT_BRIDGE_CONVERSATION_OBJECT,
  WSCHAT_BRIDGE_CALL_OBJECT,
];

const PERSON = STANDARD_OBJECTS.person.universalIdentifier;
const OPPORTUNITY = STANDARD_OBJECTS.opportunity.universalIdentifier;
const TASK = STANDARD_OBJECTS.task.universalIdentifier;
const COMPANY = STANDARD_OBJECTS.company.universalIdentifier;
const WORKSPACE_MEMBER = STANDARD_OBJECTS.workspaceMember.universalIdentifier;
const CONVERSATION = WSCHAT_BRIDGE_CONVERSATION_OBJECT.universalIdentifier;
const CALL = WSCHAT_BRIDGE_CALL_OBJECT.universalIdentifier;

const OPEN_IN_WSCHAT: WschatBridgeLocalizedText = {
  en: 'Open in WSChat',
  ru: 'Открыть в WSChat',
};

const option = (
  value: string,
  en: string,
  ru: string,
  color: TagColor,
): WschatBridgeOptionDefinition => ({ value, label: { en, ru }, color });

// A SELECT needs at least one option at creation; managed lists start with this one and keep it (never deleted)
export const WSCHAT_BRIDGE_PLACEHOLDER_OPTION = option(
  'NOT_SET',
  'Not set',
  'Не задано',
  'gray',
);

const CHANNEL_OPTIONS = {
  WHATSAPP: option('WHATSAPP', 'WhatsApp', 'WhatsApp', 'green'),
  WHATSAPP_BUSINESS: option(
    'WHATSAPP_BUSINESS',
    'WhatsApp Business',
    'WhatsApp Business',
    'jade',
  ),
  TELEGRAM: option('TELEGRAM', 'Telegram', 'Telegram', 'sky'),
  INSTAGRAM: option('INSTAGRAM', 'Instagram', 'Instagram', 'pink'),
  WIDGET: option('WIDGET', 'Website', 'Сайт', 'violet'),
  PHONE: option('PHONE', 'Phone', 'Телефон', 'blue'),
  OTHER: option('OTHER', 'Other', 'Другое', 'gray'),
};

const ALL_CHANNELS = Object.values(CHANNEL_OPTIONS);

const CALL_CHANNELS = [
  CHANNEL_OPTIONS.PHONE,
  CHANNEL_OPTIONS.WHATSAPP_BUSINESS,
  CHANNEL_OPTIONS.WHATSAPP,
  CHANNEL_OPTIONS.TELEGRAM,
  CHANNEL_OPTIONS.OTHER,
];

const EMPLOYEE = option('EMPLOYEE', 'Employee', 'Сотрудник', 'blue');
const ROBOT = option('ROBOT', 'Robot', 'Робот', 'purple');
const CLIENT = option('CLIENT', 'Client', 'Клиент', 'orange');

type FieldSpec = Omit<WschatBridgeFieldDefinition, 'isUnique'> & {
  isUnique?: boolean;
};

const field = ({
  isUnique = false,
  ...spec
}: FieldSpec): WschatBridgeFieldDefinition => ({ ...spec, isUnique });

const select = (
  spec: Omit<FieldSpec, 'type' | 'options'>,
  options: WschatBridgeOptionDefinition[],
): WschatBridgeFieldDefinition =>
  field({ ...spec, type: FieldMetadataType.SELECT, options });

const managedSelect = (
  spec: Omit<FieldSpec, 'type' | 'options' | 'dictionary'>,
  dictionary: WschatBridgeDictionary,
): WschatBridgeFieldDefinition =>
  field({
    ...spec,
    type: FieldMetadataType.SELECT,
    options: [WSCHAT_BRIDGE_PLACEHOLDER_OPTION],
    dictionary,
  });

const relation = (
  spec: Omit<FieldSpec, 'type' | 'icon' | 'relation'>,
  relationSpec: NonNullable<WschatBridgeFieldDefinition['relation']>,
): WschatBridgeFieldDefinition =>
  field({
    ...spec,
    type: FieldMetadataType.RELATION,
    icon: 'IconRelationManyToOne',
    relation: relationSpec,
  });

const { TEXT, LINKS, DATE_TIME, NUMBER, BOOLEAN } = FieldMetadataType;

const imported = (
  objectUniversalIdentifier: string,
  universalIdentifier: string,
): WschatBridgeFieldDefinition =>
  field({
    objectUniversalIdentifier,
    universalIdentifier,
    name: 'wschatImported',
    type: BOOLEAN,
    icon: 'IconHistory',
    label: { en: 'Imported from history', ru: 'Перенесено из истории' },
    description: {
      en: 'Set by WSChat on records loaded in bulk from history; workflows that react only to live events add "is false"',
      ru: 'Ставит WSChat на записях, перенесённых из истории; процессы только для живых событий добавляют условие «нет»',
    },
    defaultValue: false,
  });

// Every field WSChat writes; each *Id field is unique and is the upsert match key of its object.
// Closed lists are SELECT so workflow filters can only match real values
export const WSCHAT_BRIDGE_FIELDS: WschatBridgeFieldDefinition[] = [
  // person
  field({
    objectUniversalIdentifier: PERSON,
    universalIdentifier: '7dfb62e6-df60-48e8-8bd4-36c00994bbbf',
    name: 'wschatContactId',
    type: TEXT,
    icon: 'IconId',
    label: { en: 'WSChat contact', ru: 'Контакт WSChat' },
    isUnique: true,
  }),
  field({
    objectUniversalIdentifier: PERSON,
    universalIdentifier: '2955656d-29c9-4631-8d89-21fe5301cb30',
    name: 'wschatUrl',
    type: LINKS,
    icon: 'IconExternalLink',
    label: { en: 'WSChat dialog', ru: 'Диалог в WSChat' },
  }),
  select(
    {
      objectUniversalIdentifier: PERSON,
      universalIdentifier: 'dbe10186-7a66-43d5-be92-a26c6d9debec',
      name: 'wschatSource',
      icon: 'IconUserPlus',
      label: { en: 'Came from', ru: 'Откуда пришёл' },
    },
    ALL_CHANNELS,
  ),
  field({
    objectUniversalIdentifier: PERSON,
    universalIdentifier: '72251090-bf9c-4261-91e4-b3fb77c565c4',
    name: 'wschatMessengers',
    type: TEXT,
    icon: 'IconMessageCircle',
    label: { en: 'Messengers', ru: 'Мессенджеры' },
  }),
  field({
    objectUniversalIdentifier: PERSON,
    universalIdentifier: '5c6057ac-78b2-4261-885a-450180a43c2f',
    name: 'wschatPhones',
    type: TEXT,
    icon: 'IconPhone',
    label: { en: 'Phones (WSChat)', ru: 'Телефоны (WSChat)' },
  }),
  field({
    objectUniversalIdentifier: PERSON,
    universalIdentifier: '8f92807b-ca52-4768-ad05-3d4863b8cf60',
    name: 'wschatLastContactAt',
    type: DATE_TIME,
    icon: 'IconClock',
    label: { en: 'Last contact', ru: 'Последнее обращение' },
  }),
  select(
    {
      objectUniversalIdentifier: PERSON,
      universalIdentifier: '3ed4e1c7-7df1-443e-bc89-ee258830b991',
      name: 'wschatLastChannel',
      icon: 'IconBroadcast',
      label: { en: 'Last channel', ru: 'Канал последнего обращения' },
    },
    ALL_CHANNELS,
  ),
  imported(PERSON, '0f22da47-eb6b-4eb0-ab43-c5e0502da88d'),
  // opportunity
  field({
    objectUniversalIdentifier: OPPORTUNITY,
    universalIdentifier: 'df1c724a-5d24-466b-9eaf-6eed4c89427e',
    name: 'wschatLeadId',
    type: TEXT,
    icon: 'IconId',
    label: { en: 'WSChat lead', ru: 'Обращение WSChat' },
    isUnique: true,
  }),
  field({
    objectUniversalIdentifier: OPPORTUNITY,
    universalIdentifier: 'dcacd467-32c4-4c31-9a44-85e68c16775c',
    name: 'wschatUrl',
    type: LINKS,
    icon: 'IconExternalLink',
    label: OPEN_IN_WSCHAT,
  }),
  select(
    {
      objectUniversalIdentifier: OPPORTUNITY,
      universalIdentifier: 'ddfe9155-b24a-4b46-9aa1-ca91c71fddf1',
      name: 'wschatSource',
      icon: 'IconUserPlus',
      label: { en: 'Came from', ru: 'Откуда пришёл' },
    },
    ALL_CHANNELS,
  ),
  // task
  field({
    objectUniversalIdentifier: TASK,
    universalIdentifier: 'a04a3f80-45de-42ef-a894-d07fb80bf6bc',
    name: 'wschatTaskId',
    type: TEXT,
    icon: 'IconId',
    label: { en: 'WSChat task', ru: 'Задача WSChat' },
    isUnique: true,
  }),
  managedSelect(
    {
      objectUniversalIdentifier: TASK,
      universalIdentifier: '7e9d57fc-0bd6-4e79-ae9f-970660143795',
      name: 'wschatType',
      icon: 'IconTag',
      label: { en: 'Type', ru: 'Тип' },
    },
    'taskTypes',
  ),
  select(
    {
      objectUniversalIdentifier: TASK,
      universalIdentifier: 'dba6ad04-6939-4510-8fbd-bd0c6b115a13',
      name: 'wschatAuthor',
      icon: 'IconUser',
      label: { en: 'Set by', ru: 'Кто поставил' },
    },
    [EMPLOYEE, ROBOT, CHANNEL_OPTIONS.OTHER],
  ),
  field({
    objectUniversalIdentifier: TASK,
    universalIdentifier: '6413edba-e1e1-4553-8a29-5a52b967b378',
    name: 'wschatUrl',
    type: LINKS,
    icon: 'IconExternalLink',
    label: OPEN_IN_WSCHAT,
  }),
  imported(TASK, '66149813-c9df-47e0-99c0-940f972d2ea7'),
  // company
  field({
    objectUniversalIdentifier: COMPANY,
    universalIdentifier: '0d0b1496-6fbf-442c-829d-0c1466930738',
    name: 'wschatContactId',
    type: TEXT,
    icon: 'IconId',
    label: { en: 'WSChat contact', ru: 'Контакт WSChat' },
    isUnique: true,
  }),
  field({
    objectUniversalIdentifier: COMPANY,
    universalIdentifier: '080ee296-27fc-4bad-ae20-6a511abdde63',
    name: 'wschatUrl',
    type: LINKS,
    icon: 'IconExternalLink',
    label: { en: 'WSChat dialog', ru: 'Диалог в WSChat' },
  }),
  imported(COMPANY, 'c95f175f-15fa-4ed5-89d6-f835cf91d72c'),
  // conversation
  field({
    objectUniversalIdentifier: CONVERSATION,
    universalIdentifier: '9a21982c-a554-4659-9dc5-dfe3d6136283',
    name: 'wschatConversationId',
    type: TEXT,
    icon: 'IconId',
    label: { en: 'WSChat conversation', ru: 'Обращение WSChat' },
    isUnique: true,
  }),
  select(
    {
      objectUniversalIdentifier: CONVERSATION,
      universalIdentifier: '5bb3a0b6-6d51-48f8-b455-ea5bbeb6522d',
      name: 'channel',
      icon: 'IconBroadcast',
      label: { en: 'Channel', ru: 'Канал' },
    },
    ALL_CHANNELS,
  ),
  field({
    objectUniversalIdentifier: CONVERSATION,
    universalIdentifier: '0dbe53b9-e6d6-49a8-a2d8-9d521fc1184d',
    name: 'startedAt',
    type: DATE_TIME,
    icon: 'IconCalendarEvent',
    label: { en: 'Started', ru: 'Начато' },
  }),
  field({
    objectUniversalIdentifier: CONVERSATION,
    universalIdentifier: 'f4fdc67b-d02f-4b3a-8628-e1fb1a8d839d',
    name: 'closedAt',
    type: DATE_TIME,
    icon: 'IconCalendarEvent',
    label: { en: 'Closed', ru: 'Закрыто' },
  }),
  select(
    {
      objectUniversalIdentifier: CONVERSATION,
      universalIdentifier: '7bc32eae-00ba-4e8b-b46d-ae45022cc8ba',
      name: 'state',
      icon: 'IconStatusChange',
      label: { en: 'State', ru: 'Состояние' },
    },
    [
      option('OPEN', 'Open', 'Открыто', 'green'),
      option('CLOSED', 'Closed', 'Закрыто', 'gray'),
    ],
  ),
  managedSelect(
    {
      objectUniversalIdentifier: CONVERSATION,
      universalIdentifier: '400cf260-6b8a-42e8-a3d5-2d939278c6ea',
      name: 'outcome',
      icon: 'IconFlag',
      label: { en: 'Outcome', ru: 'Итог' },
    },
    'outcomes',
  ),
  select(
    {
      objectUniversalIdentifier: CONVERSATION,
      universalIdentifier: '4c488f0d-1d47-42f7-8538-552065d671b1',
      name: 'outcomeTone',
      icon: 'IconCircleDot',
      label: { en: 'Outcome kind', ru: 'Вид итога' },
    },
    [
      option('SUCCESS', 'Success', 'Успех', 'green'),
      option('REFUSAL', 'Refusal', 'Отказ', 'red'),
      option('POSTPONED', 'Postponed', 'Отложено', 'amber'),
      option('JUNK', 'Junk', 'Мусор', 'gray'),
    ],
  ),
  field({
    objectUniversalIdentifier: CONVERSATION,
    universalIdentifier: '4c8318f7-8bb4-4609-8cbd-a6b7c332daf3',
    name: 'outcomeNote',
    type: TEXT,
    icon: 'IconNotes',
    label: { en: 'Outcome note', ru: 'Комментарий к итогу' },
  }),
  select(
    {
      objectUniversalIdentifier: CONVERSATION,
      universalIdentifier: '9588366b-9ef9-4b1c-b92d-4f74658910a4',
      name: 'closedBy',
      icon: 'IconLogout',
      label: { en: 'Closed by', ru: 'Кто закрыл' },
    },
    [
      EMPLOYEE,
      ROBOT,
      CLIENT,
      option('AUTO', 'Automatically', 'Автоматически', 'gray'),
    ],
  ),
  field({
    objectUniversalIdentifier: CONVERSATION,
    universalIdentifier: 'f3d5d6b0-c92c-436f-b834-ceffd712116d',
    name: 'lastMessageAt',
    type: DATE_TIME,
    icon: 'IconClock',
    label: { en: 'Last message', ru: 'Последнее сообщение' },
  }),
  select(
    {
      objectUniversalIdentifier: CONVERSATION,
      universalIdentifier: '55b21829-efd7-4c0d-b0eb-c32032c9c7fb',
      name: 'lastMessageFrom',
      icon: 'IconMessageCircle',
      label: { en: 'Last message from', ru: 'Последнее сообщение от' },
    },
    [CLIENT, EMPLOYEE, ROBOT],
  ),
  field({
    objectUniversalIdentifier: CONVERSATION,
    universalIdentifier: '5af469c4-9d5a-4b83-973a-39c76953eab8',
    name: 'isNewClient',
    type: BOOLEAN,
    icon: 'IconUserPlus',
    label: { en: 'New client', ru: 'Новый клиент' },
  }),
  field({
    objectUniversalIdentifier: CONVERSATION,
    universalIdentifier: 'ecdac540-17e5-4132-9d24-d24fb651e240',
    name: 'wschatUrl',
    type: LINKS,
    icon: 'IconExternalLink',
    label: OPEN_IN_WSCHAT,
  }),
  relation(
    {
      objectUniversalIdentifier: CONVERSATION,
      universalIdentifier: '2df2e6fa-949a-498d-9515-dfbb02917aaf',
      name: 'person',
      label: { en: 'Person', ru: 'Контакт' },
    },
    {
      targetObjectUniversalIdentifier: PERSON,
      reverseLabel: { en: 'WSChat conversations', ru: 'Обращения' },
      reverseIcon: 'IconMessage',
    },
  ),
  relation(
    {
      objectUniversalIdentifier: CONVERSATION,
      universalIdentifier: 'd834e9d0-922f-4bbd-b729-3d3ff8119e7b',
      name: 'responsible',
      label: { en: 'Responsible', ru: 'Ответственный' },
    },
    {
      targetObjectUniversalIdentifier: WORKSPACE_MEMBER,
      reverseLabel: {
        en: 'WSChat conversations responsible',
        ru: 'Ответственный за обращения',
      },
      reverseIcon: 'IconMessage',
    },
  ),
  imported(CONVERSATION, '7a4dbec7-d153-4e39-ae2e-ce27833f87c9'),
  // call
  field({
    objectUniversalIdentifier: CALL,
    universalIdentifier: 'd8f5f80d-906d-4777-903a-c76595bf446b',
    name: 'wschatCallId',
    type: TEXT,
    icon: 'IconId',
    label: { en: 'WSChat call', ru: 'Звонок WSChat' },
    isUnique: true,
  }),
  select(
    {
      objectUniversalIdentifier: CALL,
      universalIdentifier: 'f2f489db-a56d-401d-9d44-ee8d338982d7',
      name: 'direction',
      icon: 'IconPhone',
      label: { en: 'Direction', ru: 'Направление' },
    },
    [
      option('INBOUND', 'Incoming', 'Входящий', 'green'),
      option('OUTBOUND', 'Outgoing', 'Исходящий', 'blue'),
    ],
  ),
  select(
    {
      objectUniversalIdentifier: CALL,
      universalIdentifier: 'b70d5618-0d59-4f18-bff6-2d9fefd9658d',
      name: 'status',
      icon: 'IconStatusChange',
      label: { en: 'Status', ru: 'Статус' },
    },
    [
      option('COMPLETED', 'Answered', 'Состоялся', 'green'),
      option('MISSED', 'Missed', 'Пропущен', 'red'),
      option('DECLINED', 'Declined', 'Отклонён', 'orange'),
      option('FAILED', 'Failed', 'Не удался', 'gray'),
    ],
  ),
  select(
    {
      objectUniversalIdentifier: CALL,
      universalIdentifier: '31d48d0d-24c1-41c8-9074-bda76d84248e',
      name: 'channel',
      icon: 'IconBroadcast',
      label: { en: 'Channel', ru: 'Канал' },
    },
    CALL_CHANNELS,
  ),
  field({
    objectUniversalIdentifier: CALL,
    universalIdentifier: '9bcab194-4f98-4e2c-89bf-518bae9105a4',
    name: 'startedAt',
    type: DATE_TIME,
    icon: 'IconCalendarEvent',
    label: { en: 'Started', ru: 'Начато' },
  }),
  field({
    objectUniversalIdentifier: CALL,
    universalIdentifier: '100dab4e-939b-4410-ad8b-8471f66fd7e2',
    name: 'durationSeconds',
    type: NUMBER,
    icon: 'IconClock',
    label: { en: 'Duration, s', ru: 'Длительность, с' },
  }),
  managedSelect(
    {
      objectUniversalIdentifier: CALL,
      universalIdentifier: '1c799156-9d8c-4d70-83f2-6c7db7f4bf0d',
      name: 'outcome',
      icon: 'IconFlag',
      label: { en: 'Outcome', ru: 'Итог' },
    },
    'outcomes',
  ),
  field({
    objectUniversalIdentifier: CALL,
    universalIdentifier: '9d418b14-c4b8-4a63-9596-cd8caa886c8d',
    name: 'outcomeNote',
    type: TEXT,
    icon: 'IconNotes',
    label: { en: 'Outcome note', ru: 'Комментарий к итогу' },
  }),
  field({
    objectUniversalIdentifier: CALL,
    universalIdentifier: '8e4ec84f-99cb-4dfe-b72e-42a8f034e78d',
    name: 'summary',
    type: TEXT,
    icon: 'IconFileText',
    label: { en: 'Summary', ru: 'Краткое содержание' },
  }),
  field({
    objectUniversalIdentifier: CALL,
    universalIdentifier: 'd3867546-0414-4458-afca-4265338929dc',
    name: 'wschatUrl',
    type: LINKS,
    icon: 'IconExternalLink',
    label: OPEN_IN_WSCHAT,
  }),
  relation(
    {
      objectUniversalIdentifier: CALL,
      universalIdentifier: 'c6f97d33-2636-4e5f-87f4-5238c4fe0045',
      name: 'person',
      label: { en: 'Person', ru: 'Контакт' },
    },
    {
      targetObjectUniversalIdentifier: PERSON,
      reverseLabel: { en: 'WSChat calls', ru: 'Звонки' },
      reverseIcon: 'IconPhone',
    },
  ),
  relation(
    {
      objectUniversalIdentifier: CALL,
      universalIdentifier: '3ea11314-f492-4f93-a6b2-0f9845568cd3',
      name: 'answeredBy',
      label: { en: 'Answered by', ru: 'Кто ответил' },
    },
    {
      targetObjectUniversalIdentifier: WORKSPACE_MEMBER,
      reverseLabel: { en: 'WSChat calls answered', ru: 'Отвеченные звонки' },
      reverseIcon: 'IconPhone',
    },
  ),
  relation(
    {
      objectUniversalIdentifier: CALL,
      universalIdentifier: '93353daa-3884-47f0-b925-a5d2ba9f9cf9',
      name: 'conversation',
      label: { en: 'Conversation', ru: 'Обращение' },
    },
    {
      targetObjectUniversalIdentifier: CONVERSATION,
      reverseLabel: { en: 'WSChat calls', ru: 'Звонки' },
      reverseIcon: 'IconPhone',
    },
  ),
  imported(CALL, '40735816-fd59-41fb-b305-d962eb3a8a27'),
];
