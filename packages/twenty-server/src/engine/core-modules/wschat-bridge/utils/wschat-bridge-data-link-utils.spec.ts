import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FieldMetadataType } from 'twenty-shared/types';

import {
  WSCHAT_BRIDGE_CALL_OBJECT,
  WSCHAT_BRIDGE_CONVERSATION_OBJECT,
  WSCHAT_BRIDGE_FIELDS,
  WSCHAT_BRIDGE_OBJECTS,
  WSCHAT_BRIDGE_PLACEHOLDER_OPTION,
  type WschatBridgeFieldDefinition,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';
import { WSCHAT_BRIDGE_OPTION_KEY_PATTERN } from 'src/engine/core-modules/wschat-bridge/utils/plan-bridge-dictionary-options.util';
import { isReservedApiKeyName } from 'src/engine/core-modules/wschat-bridge/utils/is-reserved-api-key-name.util';
import {
  computeBridgeReverseFieldName,
  planBridgeFields,
  planBridgeObjects,
  type WschatBridgeExistingField,
} from 'src/engine/core-modules/wschat-bridge/utils/plan-bridge-data-model.util';

const PERSON = STANDARD_OBJECTS.person.universalIdentifier;
const WORKSPACE_MEMBER = STANDARD_OBJECTS.workspaceMember.universalIdentifier;

const findField = (objectUniversalIdentifier: string, name: string) => {
  const field = WSCHAT_BRIDGE_FIELDS.find(
    (definition) =>
      definition.objectUniversalIdentifier === objectUniversalIdentifier &&
      definition.name === name,
  );

  if (field === undefined) {
    throw new Error(`missing definition ${name}`);
  }

  return field;
};

const CONTACT_ID_FIELD = findField(PERSON, 'wschatContactId');
const CONVERSATION_PERSON_FIELD = findField(
  WSCHAT_BRIDGE_CONVERSATION_OBJECT.universalIdentifier,
  'person',
);

const OBJECT_IDS = {
  [PERSON]: 'person-id',
  [WORKSPACE_MEMBER]: 'workspace-member-id',
  [WSCHAT_BRIDGE_CONVERSATION_OBJECT.universalIdentifier]: 'conversation-id',
};

const OBJECT_NAMES = {
  [PERSON]: 'person',
  [WORKSPACE_MEMBER]: 'workspaceMember',
  [WSCHAT_BRIDGE_CONVERSATION_OBJECT.universalIdentifier]: 'wschatConversation',
};

const buildExistingField = (
  definition: WschatBridgeFieldDefinition,
  overrides: Partial<WschatBridgeExistingField> = {},
): WschatBridgeExistingField => ({
  id: `${definition.name}-id`,
  objectMetadataId: OBJECT_IDS[definition.objectUniversalIdentifier],
  universalIdentifier: definition.universalIdentifier,
  name: definition.name,
  type: definition.type,
  isUnique: definition.isUnique,
  isActive: true,
  label: definition.label.en,
  ...overrides,
});

describe('WSChat data model definitions', () => {
  it('should use distinct universal identifiers everywhere', () => {
    const identifiers = [
      ...WSCHAT_BRIDGE_OBJECTS.map(
        ({ universalIdentifier }) => universalIdentifier,
      ),
      ...WSCHAT_BRIDGE_FIELDS.map(
        ({ universalIdentifier }) => universalIdentifier,
      ),
    ];

    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  it('should never repeat a field name on the same object', () => {
    const keys = WSCHAT_BRIDGE_FIELDS.map(
      ({ objectUniversalIdentifier, name }) =>
        `${objectUniversalIdentifier}.${name}`,
    );

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('should make exactly the WSChat id field of each object unique', () => {
    expect(
      WSCHAT_BRIDGE_FIELDS.filter(({ isUnique }) => isUnique).map(
        ({ name }) => name,
      ),
    ).toEqual([
      'wschatContactId',
      'wschatLeadId',
      'wschatTaskId',
      'wschatContactId',
      'wschatConversationId',
      'wschatCallId',
    ]);
  });

  it('should give every label a non-empty English and Russian text', () => {
    for (const { label } of WSCHAT_BRIDGE_FIELDS) {
      expect(label.en.trim()).not.toBe('');
      expect(label.ru.trim()).not.toBe('');
    }
    expect(WSCHAT_BRIDGE_CALL_OBJECT.labelPlural.ru).toBe('Звонки');
  });

  it('should compute distinct reverse list names per target object', () => {
    const reverseKeys = WSCHAT_BRIDGE_FIELDS.filter(
      ({ relation }) => relation !== undefined,
    ).map(
      ({ relation }) =>
        `${relation?.targetObjectUniversalIdentifier}.${relation === undefined ? '' : computeBridgeReverseFieldName(relation)}`,
    );

    expect(new Set(reverseKeys).size).toBe(reverseKeys.length);
  });
});

describe('WSChat SELECT fields and the history flag', () => {
  it('should give every SELECT valid, distinct option values and no other type any options', () => {
    for (const definition of WSCHAT_BRIDGE_FIELDS) {
      if (definition.type !== FieldMetadataType.SELECT) {
        expect(definition.options).toBeUndefined();
        continue;
      }

      const values = (definition.options ?? []).map(({ value }) => value);

      expect(values.length).toBeGreaterThan(0);
      expect(new Set(values).size).toBe(values.length);
      for (const value of values) {
        expect(value).toMatch(WSCHAT_BRIDGE_OPTION_KEY_PATTERN);
      }
    }
  });

  it('should keep the four WSChat outcome tones exactly', () => {
    const outcomeTone = findField(
      WSCHAT_BRIDGE_CONVERSATION_OBJECT.universalIdentifier,
      'outcomeTone',
    );

    expect(outcomeTone.options?.map(({ value }) => value)).toEqual([
      'SUCCESS',
      'REFUSAL',
      'POSTPONED',
      'JUNK',
    ]);
  });

  it('should start managed lists with the placeholder only', () => {
    const managedFields = WSCHAT_BRIDGE_FIELDS.filter(
      ({ dictionary }) => dictionary !== undefined,
    );

    expect(managedFields.map(({ name }) => name)).toEqual([
      'wschatType',
      'outcome',
      'outcome',
    ]);
    for (const { options } of managedFields) {
      expect(options).toEqual([WSCHAT_BRIDGE_PLACEHOLDER_OPTION]);
    }
  });

  it('should add wschatImported, false by default, to the five objects WSChat loads from history', () => {
    const importedFields = WSCHAT_BRIDGE_FIELDS.filter(
      ({ name }) => name === 'wschatImported',
    );

    expect(
      importedFields.map(
        ({ objectUniversalIdentifier }) => objectUniversalIdentifier,
      ),
    ).toEqual([
      PERSON,
      STANDARD_OBJECTS.task.universalIdentifier,
      STANDARD_OBJECTS.company.universalIdentifier,
      WSCHAT_BRIDGE_CONVERSATION_OBJECT.universalIdentifier,
      WSCHAT_BRIDGE_CALL_OBJECT.universalIdentifier,
    ]);
    for (const definition of importedFields) {
      expect(definition.type).toBe(FieldMetadataType.BOOLEAN);
      expect(definition.defaultValue).toBe(false);
    }
  });
});

describe('WSChat messenger and company phone fields', () => {
  it('should add the separate messenger identities to person and phones to company', () => {
    for (const name of [
      'wschatTelegram',
      'wschatTelegramId',
      'wschatInstagram',
      'wschatWhatsappId',
      'wschatMessengers',
      'wschatPhones',
    ]) {
      const definition = findField(PERSON, name);

      expect(definition.type).toBe(FieldMetadataType.TEXT);
      expect(definition.isUnique).toBe(false);
    }
    expect(
      findField(STANDARD_OBJECTS.company.universalIdentifier, 'wschatPhones')
        .type,
    ).toBe(FieldMetadataType.TEXT);
  });

  it('should plan only the newly defined fields when the rest of the model exists', () => {
    const newNames = [
      'wschatTelegram',
      'wschatTelegramId',
      'wschatInstagram',
      'wschatWhatsappId',
    ];
    const plan = planBridgeFields({
      definitions: WSCHAT_BRIDGE_FIELDS.filter(
        ({ objectUniversalIdentifier }) => objectUniversalIdentifier === PERSON,
      ),
      objectIdByUniversalIdentifier: OBJECT_IDS,
      objectNameByUniversalIdentifier: OBJECT_NAMES,
      existingFields: WSCHAT_BRIDGE_FIELDS.filter(
        ({ objectUniversalIdentifier, name }) =>
          objectUniversalIdentifier === PERSON && !newNames.includes(name),
      ).map((definition) => buildExistingField(definition)),
    });

    expect(plan.toCreate.map(({ reportName }) => reportName)).toEqual(
      newNames.map((name) => `person.${name}`),
    );
    expect(plan.conflicts).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
  });
});

describe('planBridgeObjects', () => {
  it('should create missing objects and report a foreign one with our name', () => {
    const plan = planBridgeObjects({
      definitions: WSCHAT_BRIDGE_OBJECTS,
      existingObjects: [
        {
          id: 'other-id',
          universalIdentifier: 'someone-else',
          nameSingular: 'wschatCall',
          labelSingular: 'Call',
          labelPlural: 'Calls',
          isActive: true,
        },
      ],
      locale: 'en',
    });

    expect(plan.toCreate).toEqual([WSCHAT_BRIDGE_CONVERSATION_OBJECT]);
    expect(plan.conflicts).toEqual(['wschatCall']);
  });

  it('should relabel our object only when a locale is given', () => {
    const existingObjects = [
      {
        id: 'conversation-id',
        universalIdentifier:
          WSCHAT_BRIDGE_CONVERSATION_OBJECT.universalIdentifier,
        nameSingular: 'wschatConversation',
        labelSingular: 'Conversation',
        labelPlural: 'Conversations',
        isActive: true,
      },
    ];

    expect(
      planBridgeObjects({
        definitions: [WSCHAT_BRIDGE_CONVERSATION_OBJECT],
        existingObjects,
      }).toUpdate,
    ).toEqual([]);
    expect(
      planBridgeObjects({
        definitions: [WSCHAT_BRIDGE_CONVERSATION_OBJECT],
        existingObjects,
        locale: 'ru',
      }).toUpdate,
    ).toEqual([
      {
        id: 'conversation-id',
        nameSingular: 'wschatConversation',
        update: { labelSingular: 'Обращение', labelPlural: 'Обращения' },
      },
    ]);
  });
});

describe('planBridgeFields', () => {
  const planFor = (
    definitions: WschatBridgeFieldDefinition[],
    existingFields: WschatBridgeExistingField[],
    locale?: 'en' | 'ru',
  ) =>
    planBridgeFields({
      definitions,
      objectIdByUniversalIdentifier: OBJECT_IDS,
      objectNameByUniversalIdentifier: OBJECT_NAMES,
      existingFields,
      locale,
    });

  it('should create a missing field with its relation target', () => {
    const plan = planFor([CONVERSATION_PERSON_FIELD], []);

    expect(plan.toCreate).toEqual([
      {
        definition: CONVERSATION_PERSON_FIELD,
        reportName: 'wschatConversation.person',
        objectMetadataId: 'conversation-id',
        relationTargetObjectMetadataId: 'person-id',
      },
    ]);
  });

  it('should skip a field whose object is missing', () => {
    const callField = findField(
      WSCHAT_BRIDGE_CALL_OBJECT.universalIdentifier,
      'wschatCallId',
    );

    expect(planFor([callField], []).conflicts).toHaveLength(1);
    expect(planFor([callField], []).toCreate).toEqual([]);
  });

  it('should report a foreign field that took our name or our changed field', () => {
    expect(
      planFor(
        [CONTACT_ID_FIELD],
        [buildExistingField(CONTACT_ID_FIELD, { universalIdentifier: 'x' })],
      ).conflicts,
    ).toEqual(['person.wschatContactId']);
    expect(
      planFor(
        [CONTACT_ID_FIELD],
        [buildExistingField(CONTACT_ID_FIELD, { isUnique: false })],
      ).conflicts,
    ).toEqual(['person.wschatContactId']);
  });

  it('should reactivate our field and relabel it and its reverse list for the locale', () => {
    const reverseName = computeBridgeReverseFieldName(
      CONVERSATION_PERSON_FIELD.relation ?? {
        targetObjectUniversalIdentifier: '',
        reverseLabel: { en: '', ru: '' },
        reverseIcon: '',
      },
    );
    const plan = planFor(
      [CONVERSATION_PERSON_FIELD],
      [
        buildExistingField(CONVERSATION_PERSON_FIELD, { isActive: false }),
        {
          id: 'reverse-id',
          objectMetadataId: 'person-id',
          universalIdentifier: 'generated',
          name: reverseName,
          type: FieldMetadataType.RELATION,
          isUnique: false,
          isActive: true,
          label: 'WSChat conversations',
        },
      ],
      'ru',
    );

    expect(plan.toUpdate).toEqual([
      {
        id: 'person-id',
        reportName: 'wschatConversation.person',
        update: { isActive: true, label: 'Контакт' },
      },
      {
        id: 'reverse-id',
        reportName: `wschatConversation.person~${reverseName}`,
        update: { label: 'Обращения' },
      },
    ]);
  });

  it('should leave labels alone without a locale', () => {
    expect(
      planFor(
        [CONTACT_ID_FIELD],
        [buildExistingField(CONTACT_ID_FIELD, { label: 'Свой текст' })],
      ).toUpdate,
    ).toEqual([]);
  });
});

describe('isReservedApiKeyName', () => {
  it('should match the service key name case-insensitively and trimmed', () => {
    expect(isReservedApiKeyName('WSChat')).toBe(true);
    expect(isReservedApiKeyName('  wschat ')).toBe(true);
    expect(isReservedApiKeyName('WSChat sync')).toBe(false);
  });
});
