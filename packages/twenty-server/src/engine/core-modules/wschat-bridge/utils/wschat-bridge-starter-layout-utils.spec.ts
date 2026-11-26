import { WSCHAT_BRIDGE_STANDARD_OPTION_LABELS } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-starter-layout.constant';
import { orderStarterBoardViewGroups } from 'src/engine/core-modules/wschat-bridge/utils/order-starter-board-view-groups.util';
import { planStandardOptionRelabels } from 'src/engine/core-modules/wschat-bridge/utils/plan-standard-option-relabels.util';

const TASK_STATUS = WSCHAT_BRIDGE_STANDARD_OPTION_LABELS[0];

const statusOptions = (labels: [string, string, string]) =>
  ['TODO', 'IN_PROGRESS', 'DONE'].map((value, position) => ({
    id: `id-${value}`,
    value,
    label: labels[position],
    color: 'sky',
    position,
  }));

describe('planStandardOptionRelabels', () => {
  it('should translate the shipped labels and keep every value', () => {
    const options = planStandardOptionRelabels({
      currentOptions: statusOptions(['To do', 'In progress', 'Done']),
      definition: TASK_STATUS,
      locale: 'ru',
    });

    expect(options?.map(({ value, label }) => [value, label])).toEqual([
      ['TODO', 'Открыта'],
      ['IN_PROGRESS', 'В работе'],
      ['DONE', 'Выполнена'],
    ]);
  });

  it('should never overwrite a label the company changed', () => {
    const options = planStandardOptionRelabels({
      currentOptions: statusOptions(['Надо сделать', 'In progress', 'Готово']),
      definition: TASK_STATUS,
      locale: 'ru',
    });

    expect(options?.map(({ label }) => label)).toEqual([
      'Надо сделать',
      'В работе',
      'Готово',
    ]);
  });

  it('should change nothing once translated or in English', () => {
    expect(
      planStandardOptionRelabels({
        currentOptions: statusOptions(['Открыта', 'В работе', 'Выполнена']),
        definition: TASK_STATUS,
        locale: 'ru',
      }),
    ).toBeNull();
    expect(
      planStandardOptionRelabels({
        currentOptions: statusOptions(['To do', 'In progress', 'Done']),
        definition: TASK_STATUS,
        locale: 'en',
      }),
    ).toBeNull();
  });

  it('should leave options it does not know alone', () => {
    const options = planStandardOptionRelabels({
      currentOptions: [
        ...statusOptions(['To do', 'Своё', 'Своё 2']),
        {
          id: 'x',
          value: 'BLOCKED',
          label: 'Blocked',
          color: 'red',
          position: 3,
        },
      ],
      definition: TASK_STATUS,
      locale: 'ru',
    });

    expect(options?.[3]).toEqual({
      id: 'x',
      value: 'BLOCKED',
      label: 'Blocked',
      color: 'red',
      position: 3,
    });
  });
});

describe('orderStarterBoardViewGroups', () => {
  const group = (fieldValue: string, position: number, isVisible = true) => ({
    id: `g-${fieldValue || 'empty'}`,
    fieldValue,
    position,
    isVisible,
  });

  it('should put new columns in dictionary order before the placeholder and no value', () => {
    // As upstream leaves them: new options appended after the placeholder and the empty group
    const changed = orderStarterBoardViewGroups({
      viewGroups: [
        group('NOT_SET', 0, false),
        group('', 1),
        group('T_2', 2),
        group('T_1', 3),
      ],
      optionValues: ['T_1', 'T_2', 'NOT_SET'],
      previousOptionValues: ['NOT_SET'],
      placeholderValue: 'NOT_SET',
    });

    expect(
      Object.fromEntries(changed.map(({ id, position }) => [id, position])),
    ).toEqual({ 'g-T_1': 0, 'g-T_2': 1, 'g-NOT_SET': 2, 'g-empty': 3 });
  });

  it('should keep the order the company gave to known columns', () => {
    const changed = orderStarterBoardViewGroups({
      viewGroups: [
        group('T_2', 0),
        group('T_1', 1),
        group('NOT_SET', 2, false),
        group('', 3),
        group('T_3', 4),
      ],
      optionValues: ['T_1', 'T_2', 'T_3', 'NOT_SET'],
      previousOptionValues: ['T_1', 'T_2', 'NOT_SET'],
      placeholderValue: 'NOT_SET',
    });

    expect(
      Object.fromEntries(changed.map(({ id, position }) => [id, position])),
    ).toEqual({ 'g-T_3': 2, 'g-NOT_SET': 3, 'g-empty': 4 });
  });

  it('should hide the placeholder column and report nothing when already in order', () => {
    expect(
      orderStarterBoardViewGroups({
        viewGroups: [group('T_1', 0), group('NOT_SET', 1), group('', 2)],
        optionValues: ['T_1', 'NOT_SET'],
        previousOptionValues: ['T_1', 'NOT_SET'],
        placeholderValue: 'NOT_SET',
      }),
    ).toEqual([{ ...group('NOT_SET', 1), isVisible: false }]);
    expect(
      orderStarterBoardViewGroups({
        viewGroups: [group('T_1', 0), group('NOT_SET', 1, false), group('', 2)],
        optionValues: ['T_1', 'NOT_SET'],
        previousOptionValues: ['T_1', 'NOT_SET'],
        placeholderValue: 'NOT_SET',
      }),
    ).toEqual([]);
  });
});
