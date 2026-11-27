import { readFileSync } from 'fs';
import { join } from 'path';

// Our Russian wording (WSCHAT.md): a Twenty catalog update that brings back the shipped text fails here.
// The image compiles the catalogs from these .po files, so they are what is checked.
const PACKAGES = join(__dirname, '../../../../../..');

const CATALOGS = {
  front: join(PACKAGES, 'twenty-front/src/locales/ru-RU.po'),
  server: join(
    PACKAGES,
    'twenty-server/src/engine/core-modules/i18n/locales/ru-RU.po',
  ),
};

type Translation = [
  context: string | null,
  messageId: string,
  translation: string,
];

const TRANSLATIONS: Record<keyof typeof CATALOGS, Translation[]> = {
  front: [
    [null, 'True', 'Да'],
    [null, 'False', 'Нет'],
    [null, 'True or false', 'Да или нет'],
    [null, 'No {fieldLabel}', 'Не выбрано'],
    [null, 'No {clearLabel}', 'Не выбрано'],
    [null, 'No {label}', 'Не выбрано'],
    [null, 'Create {objectLabelSingular}', 'Создать: {objectLabelSingular}'],
    [null, 'Create {0}', 'Создать: {0}'],
    [null, 'New {0}', 'Новая запись: {0}'],
    [null, 'Update {0}', 'Обновить: {0}'],
    [null, '{0} created', 'Запись создана'],
    [null, '{0} Fields', 'Поля: {0}'],
    [null, '{0} Table', 'Таблица: {0}'],
    [null, 'Add a {objectLabelSingular}', 'Добавить запись'],
    [null, 'Add your first {objectLabel}', 'Добавьте первую запись'],
    [
      null,
      'Use our API or add your first {objectLabel} manually',
      'Добавьте первую запись вручную или через API',
    ],
    [null, 'No {objectLabelSingular} found', 'Ничего не найдено'],
    [null, 'No Deleted {objectLabelSingular} found', 'Удалённых записей нет'],
    [null, 'Untitled {labelSingular}', 'Без названия'],
    [
      null,
      'Set {placeholderForEmptyCell}',
      'Задать: {placeholderForEmptyCell}',
    ],
    [null, 'Delete {relationObjectLabelSingular}', 'Удалить запись'],
    [
      null,
      'Delete Related {relationObjectLabelSingular}',
      'Удалить связанную запись',
    ],
    [null, 'Restore {objectLabel}', 'Восстановить: {objectLabel}'],
    [
      null,
      'Permanently Destroy {objectLabel}',
      'Удалить навсегда: {objectLabel}',
    ],
    [
      null,
      "Are you sure you want to destroy these {0}? They won't be recoverable anymore.",
      'Вы уверены, что хотите уничтожить эти записи? Восстановить их будет нельзя.',
    ],
    [
      null,
      'Are you sure you want to destroy this {0}? It cannot be recovered anymore.',
      'Вы уверены, что хотите уничтожить эту запись? Восстановить её будет нельзя.',
    ],
    [
      null,
      'Are you sure you want to restore these {0}?',
      'Вы уверены, что хотите восстановить эти записи?',
    ],
    [
      null,
      'Are you sure you want to restore this {0}?',
      'Вы уверены, что хотите восстановить эту запись?',
    ],
    [
      null,
      'We match on these fields. If a {0} already exists, we update it. Otherwise, we create a new one.',
      'Мы сопоставляем записи по этим полям. Если такая запись уже есть, мы её обновим, иначе создадим новую.',
    ],
    [
      null,
      'No events have been scheduled with this {objectName} yet.',
      'Запланированных событий пока нет.',
    ],
    [
      null,
      'Set up a Date field on {objectLabel} to create a Calendar',
      'Чтобы создать календарь, добавьте в объект «{objectLabel}» поле «Дата»',
    ],
    [
      null,
      'Set up a Select field on {objectLabel} to create a Kanban',
      'Чтобы создать канбан, добавьте в объект «{objectLabel}» поле «Выбор»',
    ],
    [null, 'linked a {objectLabel}', 'связал(а) запись: {objectLabel}'],
    [null, 'Select {fieldLabel}', 'Выберите значение'],
    [null, 'Select {targetObjectNameSingular}', 'Выберите запись'],
    [null, 'Enter value for {fieldLabel}', 'Введите значение'],
    [null, 'Created {objectLabel}', 'Создано: {objectLabel}'],
    [null, 'Creating {objectLabel}', 'Создание: {objectLabel}'],
    [null, 'Deleted {objectLabel}', 'Удалено: {objectLabel}'],
    [null, 'Deleting {objectLabel}', 'Удаление: {objectLabel}'],
    [null, 'Found {objectLabel}', 'Найдено: {objectLabel}'],
    [null, 'Finding {objectLabel}', 'Поиск: {objectLabel}'],
    [null, 'Grouped {objectLabel}', 'Сгруппировано: {objectLabel}'],
    [null, 'Grouping {objectLabel}', 'Группировка: {objectLabel}'],
    [null, 'Merged {objectLabel}', 'Объединено: {objectLabel}'],
    [null, 'Merging {objectLabel}', 'Объединение: {objectLabel}'],
    [null, 'Searched {objectLabel}', 'Выполнен поиск: {objectLabel}'],
    [null, 'Searching {objectLabel}', 'Выполняется поиск: {objectLabel}'],
    [null, 'Updated {objectLabel}', 'Обновлено: {objectLabel}'],
    [null, 'Updating {objectLabel}', 'Обновление: {objectLabel}'],
    [null, 'Upserted {objectLabel}', 'Добавлено/обновлено: {objectLabel}'],
    [null, 'Upserting {objectLabel}', 'Добавление/обновление: {objectLabel}'],
    [null, 'Delete {objectLabel}', 'Удалить: {objectLabel}'],
    [null, 'Edit {objectLabel}', 'Редактировать: {objectLabel}'],
    [null, 'See {objectLabel}', 'Посмотреть: {objectLabel}'],
    [null, 'Destroy {objectLabel}', 'Уничтожить: {objectLabel}'],
    [null, 'Count true', 'Подсчитать «Да»'],
    [null, 'Count false', 'Подсчитать «Нет»'],
    [null, 'Probability of true', 'Вероятность «Да»'],
    ['Field type', 'True/False', 'Да/Нет'],
    [null, 'Is not null', 'Задано'],
    ['Field type', 'Array', 'Массив'],
    [
      null,
      'Run a workflow and return here to view its executions',
      'Запустите рабочий процесс и вернитесь сюда, чтобы увидеть его запуски',
    ],
  ],
  server: [
    [
      'commandMenuItem.label',
      'Create {objectLabelSingular}',
      'Создать: {objectLabelSingular}',
    ],
    ['commandMenuItem.label', 'Delete {objectLabel}', 'Удалить: {objectLabel}'],
    [
      'commandMenuItem.shortLabel',
      'Deleted {objectLabelPlural}',
      'Удалённые: {objectLabelPlural}',
    ],
    ['commandMenuItem.label', 'Export {objectLabel}', 'Экспорт: {objectLabel}'],
    [
      'commandMenuItem.label',
      'Go to {objectLabelPlural}',
      'Перейти: {objectLabelPlural}',
    ],
    [
      'commandMenuItem.label',
      'Hide deleted {objectLabelPlural}',
      'Скрыть удалённые: {objectLabelPlural}',
    ],
    [
      'commandMenuItem.label',
      'Import {objectLabelPlural}',
      'Импорт: {objectLabelPlural}',
    ],
    [
      'commandMenuItem.label',
      'Merge {objectLabelPlural}',
      'Объединить: {objectLabelPlural}',
    ],
    [
      'commandMenuItem.label',
      'Merge with Another {objectLabelSingular}',
      'Объединить с другой записью',
    ],
    [
      'commandMenuItem.label',
      'Navigate to next {objectLabelSingular}',
      'Следующая запись',
    ],
    [
      'commandMenuItem.label',
      'Navigate to previous {objectLabelSingular}',
      'Предыдущая запись',
    ],
    [
      'commandMenuItem.label',
      'Permanently destroy {objectLabel}',
      'Удалить навсегда: {objectLabel}',
    ],
    [
      'commandMenuItem.label',
      'Restore {objectLabel}',
      'Восстановить: {objectLabel}',
    ],
    [
      'commandMenuItem.label',
      'See deleted {objectLabelPlural}',
      'Показать удалённые: {objectLabelPlural}',
    ],
    [
      'commandMenuItem.label',
      'Update {objectLabelPlural}',
      'Обновить: {objectLabelPlural}',
    ],
    [null, 'Count true', 'Подсчитать «Да»'],
    [null, 'Count false', 'Подсчитать «Нет»'],
  ],
};

const escapePo = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const findTranslation = (
  catalog: string,
  [context, messageId]: Translation,
) => {
  const blocks = catalog
    .split('\n\n')
    .filter(
      (block) =>
        block.includes(`\nmsgid "${escapePo(messageId)}"\n`) &&
        (context === null
          ? !block.includes('msgctxt ')
          : block.includes(`msgctxt "${context}"\n`)),
    );

  return blocks.length === 1
    ? blocks[0].match(/\nmsgstr "((?:[^"\\]|\\.)*)"/)?.[1]
    : `${blocks.length} entries`;
};

describe.each(Object.keys(CATALOGS) as (keyof typeof CATALOGS)[])(
  'Russian %s catalog',
  (catalogName) => {
    const catalog = readFileSync(CATALOGS[catalogName], 'utf8');

    it.each(TRANSLATIONS[catalogName])(
      '%s %s reads «%s»',
      (context, messageId, translation) => {
        expect(
          findTranslation(catalog, [context, messageId, translation]),
        ).toBe(escapePo(translation));
      },
    );
  },
);
