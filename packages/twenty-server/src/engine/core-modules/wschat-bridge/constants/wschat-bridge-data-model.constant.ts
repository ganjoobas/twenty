import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FieldMetadataType } from 'twenty-shared/types';

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

export type WschatBridgeFieldDefinition = {
  objectUniversalIdentifier: string;
  universalIdentifier: string;
  name: string;
  type: FieldMetadataType;
  isUnique: boolean;
  icon: string;
  label: WschatBridgeLocalizedText;
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

const buildField = (
  objectUniversalIdentifier: string,
  universalIdentifier: string,
  name: string,
  type: FieldMetadataType,
  icon: string,
  label: WschatBridgeLocalizedText,
  isUnique = false,
): WschatBridgeFieldDefinition => ({
  objectUniversalIdentifier,
  universalIdentifier,
  name,
  type,
  icon,
  label,
  isUnique,
});

const buildRelation = (
  objectUniversalIdentifier: string,
  universalIdentifier: string,
  name: string,
  label: WschatBridgeLocalizedText,
  relation: NonNullable<WschatBridgeFieldDefinition['relation']>,
): WschatBridgeFieldDefinition => ({
  ...buildField(
    objectUniversalIdentifier,
    universalIdentifier,
    name,
    FieldMetadataType.RELATION,
    'IconRelationManyToOne',
    label,
  ),
  relation,
});

const { TEXT, LINKS, DATE_TIME, NUMBER } = FieldMetadataType;

// Every field WSChat writes; each *Id field is unique and is the upsert match key of its object
export const WSCHAT_BRIDGE_FIELDS: WschatBridgeFieldDefinition[] = [
  // person
  buildField(
    PERSON,
    '7dfb62e6-df60-48e8-8bd4-36c00994bbbf',
    'wschatContactId',
    TEXT,
    'IconId',
    { en: 'WSChat contact', ru: 'Контакт WSChat' },
    true,
  ),
  buildField(
    PERSON,
    '2955656d-29c9-4631-8d89-21fe5301cb30',
    'wschatUrl',
    LINKS,
    'IconExternalLink',
    { en: 'WSChat dialog', ru: 'Диалог в WSChat' },
  ),
  buildField(
    PERSON,
    'dbe10186-7a66-43d5-be92-a26c6d9debec',
    'wschatSource',
    TEXT,
    'IconUserPlus',
    { en: 'Came from', ru: 'Откуда пришёл' },
  ),
  buildField(
    PERSON,
    '72251090-bf9c-4261-91e4-b3fb77c565c4',
    'wschatMessengers',
    TEXT,
    'IconMessageCircle',
    { en: 'Messengers', ru: 'Мессенджеры' },
  ),
  buildField(
    PERSON,
    '5c6057ac-78b2-4261-885a-450180a43c2f',
    'wschatPhones',
    TEXT,
    'IconPhone',
    { en: 'Phones (WSChat)', ru: 'Телефоны (WSChat)' },
  ),
  buildField(
    PERSON,
    '8f92807b-ca52-4768-ad05-3d4863b8cf60',
    'wschatLastContactAt',
    DATE_TIME,
    'IconClock',
    { en: 'Last contact', ru: 'Последнее обращение' },
  ),
  buildField(
    PERSON,
    '3ed4e1c7-7df1-443e-bc89-ee258830b991',
    'wschatLastChannel',
    TEXT,
    'IconBroadcast',
    { en: 'Last channel', ru: 'Канал последнего обращения' },
  ),
  // opportunity
  buildField(
    OPPORTUNITY,
    'df1c724a-5d24-466b-9eaf-6eed4c89427e',
    'wschatLeadId',
    TEXT,
    'IconId',
    { en: 'WSChat lead', ru: 'Обращение WSChat' },
    true,
  ),
  buildField(
    OPPORTUNITY,
    'dcacd467-32c4-4c31-9a44-85e68c16775c',
    'wschatUrl',
    LINKS,
    'IconExternalLink',
    OPEN_IN_WSCHAT,
  ),
  buildField(
    OPPORTUNITY,
    'ddfe9155-b24a-4b46-9aa1-ca91c71fddf1',
    'wschatSource',
    TEXT,
    'IconUserPlus',
    { en: 'Came from', ru: 'Откуда пришёл' },
  ),
  // task
  buildField(
    TASK,
    'a04a3f80-45de-42ef-a894-d07fb80bf6bc',
    'wschatTaskId',
    TEXT,
    'IconId',
    { en: 'WSChat task', ru: 'Задача WSChat' },
    true,
  ),
  buildField(
    TASK,
    '7e9d57fc-0bd6-4e79-ae9f-970660143795',
    'wschatType',
    TEXT,
    'IconTag',
    { en: 'Type', ru: 'Тип' },
  ),
  buildField(
    TASK,
    'dba6ad04-6939-4510-8fbd-bd0c6b115a13',
    'wschatAuthor',
    TEXT,
    'IconUser',
    { en: 'Set by', ru: 'Кто поставил' },
  ),
  buildField(
    TASK,
    '6413edba-e1e1-4553-8a29-5a52b967b378',
    'wschatUrl',
    LINKS,
    'IconExternalLink',
    OPEN_IN_WSCHAT,
  ),
  // company
  buildField(
    COMPANY,
    '0d0b1496-6fbf-442c-829d-0c1466930738',
    'wschatContactId',
    TEXT,
    'IconId',
    { en: 'WSChat contact', ru: 'Контакт WSChat' },
    true,
  ),
  buildField(
    COMPANY,
    '080ee296-27fc-4bad-ae20-6a511abdde63',
    'wschatUrl',
    LINKS,
    'IconExternalLink',
    { en: 'WSChat dialog', ru: 'Диалог в WSChat' },
  ),
  // conversation
  buildField(
    CONVERSATION,
    '9a21982c-a554-4659-9dc5-dfe3d6136283',
    'wschatConversationId',
    TEXT,
    'IconId',
    { en: 'WSChat conversation', ru: 'Обращение WSChat' },
    true,
  ),
  buildField(
    CONVERSATION,
    '5bb3a0b6-6d51-48f8-b455-ea5bbeb6522d',
    'channel',
    TEXT,
    'IconBroadcast',
    { en: 'Channel', ru: 'Канал' },
  ),
  buildField(
    CONVERSATION,
    '0dbe53b9-e6d6-49a8-a2d8-9d521fc1184d',
    'startedAt',
    DATE_TIME,
    'IconCalendarEvent',
    { en: 'Started', ru: 'Начато' },
  ),
  buildField(
    CONVERSATION,
    'f4fdc67b-d02f-4b3a-8628-e1fb1a8d839d',
    'closedAt',
    DATE_TIME,
    'IconCalendarEvent',
    { en: 'Closed', ru: 'Закрыто' },
  ),
  buildField(
    CONVERSATION,
    '7bc32eae-00ba-4e8b-b46d-ae45022cc8ba',
    'state',
    TEXT,
    'IconStatusChange',
    { en: 'State', ru: 'Состояние' },
  ),
  buildField(
    CONVERSATION,
    '400cf260-6b8a-42e8-a3d5-2d939278c6ea',
    'outcome',
    TEXT,
    'IconFlag',
    { en: 'Outcome', ru: 'Итог' },
  ),
  buildField(
    CONVERSATION,
    '4c488f0d-1d47-42f7-8538-552065d671b1',
    'outcomeTone',
    TEXT,
    'IconCircleDot',
    { en: 'Outcome kind', ru: 'Вид итога' },
  ),
  buildField(
    CONVERSATION,
    '4c8318f7-8bb4-4609-8cbd-a6b7c332daf3',
    'outcomeNote',
    TEXT,
    'IconNotes',
    { en: 'Outcome note', ru: 'Комментарий к итогу' },
  ),
  buildField(
    CONVERSATION,
    '9588366b-9ef9-4b1c-b92d-4f74658910a4',
    'closedBy',
    TEXT,
    'IconLogout',
    { en: 'Closed by', ru: 'Кто закрыл' },
  ),
  buildField(
    CONVERSATION,
    'ecdac540-17e5-4132-9d24-d24fb651e240',
    'wschatUrl',
    LINKS,
    'IconExternalLink',
    OPEN_IN_WSCHAT,
  ),
  buildRelation(
    CONVERSATION,
    '2df2e6fa-949a-498d-9515-dfbb02917aaf',
    'person',
    { en: 'Person', ru: 'Контакт' },
    {
      targetObjectUniversalIdentifier: PERSON,
      reverseLabel: { en: 'WSChat conversations', ru: 'Обращения' },
      reverseIcon: 'IconMessage',
    },
  ),
  buildRelation(
    CONVERSATION,
    'd834e9d0-922f-4bbd-b729-3d3ff8119e7b',
    'responsible',
    { en: 'Responsible', ru: 'Ответственный' },
    {
      targetObjectUniversalIdentifier: WORKSPACE_MEMBER,
      reverseLabel: {
        en: 'WSChat conversations responsible',
        ru: 'Ответственный за обращения',
      },
      reverseIcon: 'IconMessage',
    },
  ),
  // call
  buildField(
    CALL,
    'd8f5f80d-906d-4777-903a-c76595bf446b',
    'wschatCallId',
    TEXT,
    'IconId',
    { en: 'WSChat call', ru: 'Звонок WSChat' },
    true,
  ),
  buildField(
    CALL,
    'f2f489db-a56d-401d-9d44-ee8d338982d7',
    'direction',
    TEXT,
    'IconPhone',
    { en: 'Direction', ru: 'Направление' },
  ),
  buildField(
    CALL,
    'b70d5618-0d59-4f18-bff6-2d9fefd9658d',
    'status',
    TEXT,
    'IconStatusChange',
    { en: 'Status', ru: 'Статус' },
  ),
  buildField(
    CALL,
    '9bcab194-4f98-4e2c-89bf-518bae9105a4',
    'startedAt',
    DATE_TIME,
    'IconCalendarEvent',
    { en: 'Started', ru: 'Начато' },
  ),
  buildField(
    CALL,
    '100dab4e-939b-4410-ad8b-8471f66fd7e2',
    'durationSeconds',
    NUMBER,
    'IconClock',
    { en: 'Duration, s', ru: 'Длительность, с' },
  ),
  buildField(
    CALL,
    '1c799156-9d8c-4d70-83f2-6c7db7f4bf0d',
    'outcome',
    TEXT,
    'IconFlag',
    { en: 'Outcome', ru: 'Итог' },
  ),
  buildField(
    CALL,
    '9d418b14-c4b8-4a63-9596-cd8caa886c8d',
    'outcomeNote',
    TEXT,
    'IconNotes',
    { en: 'Outcome note', ru: 'Комментарий к итогу' },
  ),
  buildField(
    CALL,
    '8e4ec84f-99cb-4dfe-b72e-42a8f034e78d',
    'summary',
    TEXT,
    'IconFileText',
    { en: 'Summary', ru: 'Краткое содержание' },
  ),
  buildField(
    CALL,
    'd3867546-0414-4458-afca-4265338929dc',
    'wschatUrl',
    LINKS,
    'IconExternalLink',
    OPEN_IN_WSCHAT,
  ),
  buildRelation(
    CALL,
    'c6f97d33-2636-4e5f-87f4-5238c4fe0045',
    'person',
    { en: 'Person', ru: 'Контакт' },
    {
      targetObjectUniversalIdentifier: PERSON,
      reverseLabel: { en: 'WSChat calls', ru: 'Звонки' },
      reverseIcon: 'IconPhone',
    },
  ),
  buildRelation(
    CALL,
    '3ea11314-f492-4f93-a6b2-0f9845568cd3',
    'answeredBy',
    { en: 'Answered by', ru: 'Кто ответил' },
    {
      targetObjectUniversalIdentifier: WORKSPACE_MEMBER,
      reverseLabel: { en: 'WSChat calls answered', ru: 'Отвеченные звонки' },
      reverseIcon: 'IconPhone',
    },
  ),
  buildRelation(
    CALL,
    '93353daa-3884-47f0-b925-a5d2ba9f9cf9',
    'conversation',
    { en: 'Conversation', ru: 'Обращение' },
    {
      targetObjectUniversalIdentifier: CONVERSATION,
      reverseLabel: { en: 'WSChat calls', ru: 'Звонки' },
      reverseIcon: 'IconPhone',
    },
  ),
];
