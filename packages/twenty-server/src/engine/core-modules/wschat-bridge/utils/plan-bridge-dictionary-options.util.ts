import { type TagColor } from 'twenty-shared/types';

import { type WschatBridgeLocale } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';

// Twenty's limits for SELECT options (validate-metadata-option-value/label.util.ts): 63 characters, value in
// UPPER_SNAKE_CASE, no comma in labels. Labels are capped lower so the archive suffix always fits
export const WSCHAT_BRIDGE_OPTION_KEY_PATTERN =
  /^(?!.*__)[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
export const WSCHAT_BRIDGE_OPTION_KEY_MAX_LENGTH = 63;
export const WSCHAT_BRIDGE_OPTION_LABEL_MAX_LENGTH = 52;
export const WSCHAT_BRIDGE_MAX_DICTIONARY_ITEMS = 200;

const ARCHIVE_SUFFIX_BY_LOCALE: Record<WschatBridgeLocale, string> = {
  en: ' (archived)',
  ru: ' (архив)',
};

export type WschatBridgeDictionaryItem = {
  key: string;
  label: string;
  color?: TagColor;
  archived?: boolean;
};

export type WschatBridgeCurrentOption = {
  id?: string;
  value: string;
  label: string;
  color: TagColor;
  position: number;
  isActive?: boolean;
};

export type WschatBridgeDictionaryStats = {
  added: number;
  relabelled: number;
  archived: number;
  orphanOptions: number;
  total: number;
};

// null when valid; otherwise the first problem found, worded for the caller
export const findDictionaryItemsProblem = ({
  items,
  reservedKeys,
}: {
  items: WschatBridgeDictionaryItem[];
  reservedKeys: string[];
}): string | null => {
  if (items.length > WSCHAT_BRIDGE_MAX_DICTIONARY_ITEMS) {
    return `At most ${WSCHAT_BRIDGE_MAX_DICTIONARY_ITEMS} items per list`;
  }

  const seenKeys = new Set<string>();

  for (const { key, label } of items) {
    if (
      key.length > WSCHAT_BRIDGE_OPTION_KEY_MAX_LENGTH ||
      !WSCHAT_BRIDGE_OPTION_KEY_PATTERN.test(key)
    ) {
      return `Key "${key}" must be UPPER_SNAKE_CASE, at most ${WSCHAT_BRIDGE_OPTION_KEY_MAX_LENGTH} characters`;
    }

    if (reservedKeys.includes(key)) {
      return `Key "${key}" is reserved`;
    }

    if (seenKeys.has(key)) {
      return `Key "${key}" appears twice`;
    }

    seenKeys.add(key);

    const trimmedLabel = label.trim();

    if (
      trimmedLabel.length === 0 ||
      trimmedLabel.length > WSCHAT_BRIDGE_OPTION_LABEL_MAX_LENGTH ||
      trimmedLabel.includes(',')
    ) {
      return `Label of "${key}" must be 1..${WSCHAT_BRIDGE_OPTION_LABEL_MAX_LENGTH} characters without a comma`;
    }
  }

  return null;
};

// Idempotent in both locales: a label already ending in either suffix is left as it is
export const withArchiveSuffix = (
  label: string,
  locale: WschatBridgeLocale,
): string =>
  Object.values(ARCHIVE_SUFFIX_BY_LOCALE).some((suffix) =>
    label.endsWith(suffix),
  )
    ? label
    : `${label}${ARCHIVE_SUFFIX_BY_LOCALE[locale]}`;

// Options are never removed: deleting one blanks it on every record. Absent ones are kept as "orphans", after the
// requested ones (live first, archived after), with the placeholder kept last
export const planBridgeDictionaryOptions = ({
  currentOptions,
  items,
  locale,
  placeholderValue,
}: {
  currentOptions: WschatBridgeCurrentOption[];
  items: WschatBridgeDictionaryItem[];
  locale: WschatBridgeLocale;
  placeholderValue: string;
}): {
  options: WschatBridgeCurrentOption[];
  isChanged: boolean;
  stats: WschatBridgeDictionaryStats;
} => {
  const currentByValue = new Map(
    currentOptions.map((option) => [option.value, option]),
  );
  const requestedKeys = new Set(items.map(({ key }) => key));
  const stats: WschatBridgeDictionaryStats = {
    added: 0,
    relabelled: 0,
    archived: 0,
    orphanOptions: 0,
    total: 0,
  };

  const orderedItems = [
    ...items.filter(({ archived }) => archived !== true),
    ...items.filter(({ archived }) => archived === true),
  ];

  const requestedOptions = orderedItems.map(
    ({ key, label, color, archived }) => {
      const current = currentByValue.get(key);
      const trimmedLabel = label.trim();
      const targetLabel =
        archived === true
          ? withArchiveSuffix(trimmedLabel, locale)
          : trimmedLabel;
      const targetColor = color ?? current?.color ?? 'gray';

      if (current === undefined) {
        stats.added++;
      } else if (
        current.label !== targetLabel ||
        current.color !== targetColor
      ) {
        if (archived === true && current.label !== targetLabel) {
          stats.archived++;
        } else {
          stats.relabelled++;
        }
      }

      return {
        ...(current?.id !== undefined ? { id: current.id } : {}),
        value: key,
        label: targetLabel,
        color: targetColor,
        ...(current?.isActive === false ? { isActive: false } : {}),
      };
    },
  );

  const orphanOptions = currentOptions
    .filter(
      ({ value }) => !requestedKeys.has(value) && value !== placeholderValue,
    )
    .sort((left, right) => left.position - right.position);
  const placeholderOptions = currentOptions.filter(
    ({ value }) => value === placeholderValue,
  );

  stats.orphanOptions = orphanOptions.length;

  const options = [
    ...requestedOptions,
    ...orphanOptions,
    ...placeholderOptions,
  ].map((option, position) => ({ ...option, position }));

  stats.total = options.length;

  const isChanged =
    stats.added + stats.relabelled + stats.archived > 0 ||
    options.some(
      (option) =>
        currentByValue.get(option.value)?.position !== option.position,
    );

  return { options, isChanged, stats };
};
