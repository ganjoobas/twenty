import {
  findDictionaryItemsProblem,
  planBridgeDictionaryOptions,
  type WschatBridgeCurrentOption,
  withArchiveSuffix,
} from 'src/engine/core-modules/wschat-bridge/utils/plan-bridge-dictionary-options.util';

const PLACEHOLDER = 'NOT_SET';

const currentOption = (
  value: string,
  label: string,
  position: number,
): WschatBridgeCurrentOption => ({
  id: `${value}-id`,
  value,
  label,
  color: 'gray',
  position,
});

describe('findDictionaryItemsProblem', () => {
  it('should accept valid items', () => {
    expect(
      findDictionaryItemsProblem({
        items: [{ key: 'SOLD', label: 'Sold' }],
        reservedKeys: [PLACEHOLDER],
      }),
    ).toBeNull();
  });

  it('should reject a bad key, a reserved or duplicated key, a comma and a too long label', () => {
    const check = (items: { key: string; label: string }[]) =>
      findDictionaryItemsProblem({ items, reservedKeys: [PLACEHOLDER] });

    expect(check([{ key: 'sold', label: 'Sold' }])).not.toBeNull();
    expect(check([{ key: 'SOLD__OUT', label: 'Sold' }])).not.toBeNull();
    expect(check([{ key: PLACEHOLDER, label: 'Sold' }])).not.toBeNull();
    expect(
      check([
        { key: 'SOLD', label: 'Sold' },
        { key: 'SOLD', label: 'Sold again' },
      ]),
    ).not.toBeNull();
    expect(check([{ key: 'SOLD', label: 'Sold, paid' }])).not.toBeNull();
    expect(check([{ key: 'SOLD', label: 'x'.repeat(53) }])).not.toBeNull();
  });
});

describe('withArchiveSuffix', () => {
  it('should add the suffix of the locale once', () => {
    expect(withArchiveSuffix('Sold', 'en')).toBe('Sold (archived)');
    expect(withArchiveSuffix('Продано', 'ru')).toBe('Продано (архив)');
    expect(withArchiveSuffix('Sold (archived)', 'en')).toBe('Sold (archived)');
    expect(withArchiveSuffix('Продано (архив)', 'en')).toBe('Продано (архив)');
  });
});

describe('planBridgeDictionaryOptions', () => {
  it('should add, relabel, archive and keep orphans and the placeholder last', () => {
    const { options, isChanged, stats } = planBridgeDictionaryOptions({
      currentOptions: [
        currentOption('SOLD', 'Sold', 0),
        currentOption('LOST', 'Lost', 1),
        currentOption('OLD', 'Old one', 2),
        currentOption(PLACEHOLDER, 'Not set', 3),
      ],
      items: [
        { key: 'LOST', label: 'Lost', archived: true },
        { key: 'SOLD', label: 'Sold!' },
        { key: 'CALL_BACK', label: 'Call back', color: 'amber' },
      ],
      locale: 'en',
      placeholderValue: PLACEHOLDER,
    });

    expect(
      options.map(({ value, label, position }) => [value, label, position]),
    ).toEqual([
      ['SOLD', 'Sold!', 0],
      ['CALL_BACK', 'Call back', 1],
      ['LOST', 'Lost (archived)', 2],
      ['OLD', 'Old one', 3],
      [PLACEHOLDER, 'Not set', 4],
    ]);
    expect(options[0].id).toBe('SOLD-id');
    expect(options[1].id).toBeUndefined();
    expect(isChanged).toBe(true);
    expect(stats).toEqual({
      added: 1,
      relabelled: 1,
      archived: 1,
      orphanOptions: 1,
      total: 5,
    });
  });

  it('should report no change when the request matches the workspace', () => {
    const { isChanged, stats } = planBridgeDictionaryOptions({
      currentOptions: [
        currentOption('SOLD', 'Sold', 0),
        currentOption('LOST', 'Lost (архив)', 1),
        currentOption(PLACEHOLDER, 'Не задано', 2),
      ],
      items: [
        { key: 'SOLD', label: 'Sold' },
        { key: 'LOST', label: 'Lost', archived: true },
      ],
      locale: 'ru',
      placeholderValue: PLACEHOLDER,
    });

    expect(isChanged).toBe(false);
    expect(stats.added + stats.relabelled + stats.archived).toBe(0);
  });
});
