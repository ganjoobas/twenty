import {
  isIndexViewUntouched,
  planIndexViewAppend,
  planIndexViewReshape,
  type WschatBridgeIndexViewField,
} from 'src/engine/core-modules/wschat-bridge/utils/plan-index-view-columns.util';

const SHIPPED_NAME = 'All {objectLabelPlural}';

const engineField = (
  fieldName: string,
  position: number,
  overrides: Partial<WschatBridgeIndexViewField> = {},
): WschatBridgeIndexViewField => ({
  id: `vf-${fieldName}`,
  fieldName,
  position,
  isVisible: true,
  isSystemSideEffect: true,
  hasOverrides: false,
  ...overrides,
});

const AUTO_FIELDS = [
  'name',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
].map((fieldName, position) => engineField(fieldName, position));

describe('isIndexViewUntouched', () => {
  it('should accept the view as the engine made it', () => {
    expect(
      isIndexViewUntouched({
        viewName: SHIPPED_NAME,
        shippedViewName: SHIPPED_NAME,
        viewHasOverrides: false,
        viewFields: AUTO_FIELDS,
      }),
    ).toBe(true);
  });

  it('should refuse a renamed view, a hidden, moved or added column', () => {
    const base = {
      viewName: SHIPPED_NAME,
      shippedViewName: SHIPPED_NAME,
      viewHasOverrides: false,
      viewFields: AUTO_FIELDS,
    };

    expect(isIndexViewUntouched({ ...base, viewHasOverrides: true })).toBe(
      false,
    );
    expect(isIndexViewUntouched({ ...base, viewName: 'Мои обращения' })).toBe(
      false,
    );
    expect(
      isIndexViewUntouched({
        ...base,
        viewFields: [
          ...AUTO_FIELDS.slice(1),
          engineField('name', 0, { isVisible: false }),
        ],
      }),
    ).toBe(false);
    expect(
      isIndexViewUntouched({
        ...base,
        viewFields: [
          ...AUTO_FIELDS.slice(1),
          engineField('name', 3, { hasOverrides: true }),
        ],
      }),
    ).toBe(false);
    expect(
      isIndexViewUntouched({
        ...base,
        viewFields: [
          ...AUTO_FIELDS,
          engineField('channel', 5, { isSystemSideEffect: false }),
        ],
      }),
    ).toBe(false);
  });
});

describe('planIndexViewReshape', () => {
  it('should keep the label first, add the wanted columns and hide the rest without deleting', () => {
    const plan = planIndexViewReshape({
      viewFields: AUTO_FIELDS,
      fieldNames: ['name', 'person', 'channel'],
    });

    expect(plan.toCreate).toEqual([
      { fieldName: 'person', position: 1 },
      { fieldName: 'channel', position: 2 },
    ]);
    expect(plan.toUpdate).toEqual([
      { id: 'vf-createdAt', position: 3, isVisible: false },
      { id: 'vf-createdBy', position: 4, isVisible: false },
      { id: 'vf-updatedAt', position: 5, isVisible: false },
      { id: 'vf-updatedBy', position: 6, isVisible: false },
    ]);
  });

  it('should reuse a column the engine already shows', () => {
    const plan = planIndexViewReshape({
      viewFields: [...AUTO_FIELDS, engineField('channel', 5)],
      fieldNames: ['name', 'channel'],
    });

    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toContainEqual({
      id: 'vf-channel',
      position: 1,
      isVisible: true,
    });
  });
});

describe('planIndexViewAppend', () => {
  it('should add only missing columns after the last one and move nothing', () => {
    const plan = planIndexViewAppend({
      viewFields: [
        engineField('name', 0),
        engineField('city', 4),
        engineField('wschatUrl', 7, { isVisible: false }),
      ],
      fieldNames: ['wschatLastContactAt', 'wschatLastChannel', 'wschatUrl'],
    });

    expect(plan).toEqual({
      toCreate: [
        { fieldName: 'wschatLastContactAt', position: 8 },
        { fieldName: 'wschatLastChannel', position: 9 },
      ],
      toUpdate: [],
    });
  });
});
