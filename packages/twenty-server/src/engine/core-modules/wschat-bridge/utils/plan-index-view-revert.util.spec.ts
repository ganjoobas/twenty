import { planIndexViewRevert } from 'src/engine/core-modules/wschat-bridge/utils/plan-index-view-revert.util';

const OUR_NAMES = ['All conversations', 'Все обращения'];
const OUR_FIELDS = ['name', 'person', 'channel'];
const TEMPLATE = 'All {objectLabelPlural}';

const field = (
  fieldName: string,
  overrides: Partial<{
    isSystemSideEffect: boolean;
    hasOverrides: boolean;
    basePosition: number;
    baseIsVisible: boolean;
    effectiveIsVisible: boolean;
  }> = {},
) => ({
  id: `vf-${fieldName}`,
  fieldName,
  isSystemSideEffect: true,
  hasOverrides: true,
  basePosition: 7,
  baseIsVisible: true,
  effectiveIsVisible: true,
  ...overrides,
});

// As version 2 left it: our name over the template, our columns shown, the engine's others hidden by override
const AFTER_VERSION_2 = [
  field('name'),
  field('person'),
  field('channel', { isSystemSideEffect: false, hasOverrides: false }),
  field('createdAt', { effectiveIsVisible: false }),
];

describe('planIndexViewRevert', () => {
  it('should put back the base values of overridden engine columns and drop the column version 2 added', () => {
    expect(
      planIndexViewRevert({
        effectiveViewName: 'Все обращения',
        baseViewName: TEMPLATE,
        ourViewNames: OUR_NAMES,
        ourFieldNames: OUR_FIELDS,
        viewFields: AFTER_VERSION_2,
      }),
    ).toEqual({
      kind: 'revert',
      toUpdate: ['name', 'person', 'createdAt'].map((fieldName) => ({
        id: `vf-${fieldName}`,
        position: 7,
        isVisible: true,
      })),
      toDelete: ['vf-channel'],
    });
  });

  it('should do nothing on an INDEX view version 2 never renamed', () => {
    expect(
      planIndexViewRevert({
        effectiveViewName: TEMPLATE,
        baseViewName: TEMPLATE,
        ourViewNames: OUR_NAMES,
        ourFieldNames: OUR_FIELDS,
        viewFields: AFTER_VERSION_2,
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  it('should leave a view the company renamed or whose columns it changed', () => {
    const base = {
      baseViewName: TEMPLATE,
      ourViewNames: OUR_NAMES,
      ourFieldNames: OUR_FIELDS,
    };

    expect(
      planIndexViewRevert({
        ...base,
        effectiveViewName: 'Мои обращения',
        viewFields: AFTER_VERSION_2,
      }),
    ).toEqual({ kind: 'skipped' });
    expect(
      planIndexViewRevert({
        ...base,
        effectiveViewName: 'Все обращения',
        viewFields: [...AFTER_VERSION_2.slice(0, 3), field('createdAt')],
      }),
    ).toEqual({ kind: 'skipped' });
  });
});
