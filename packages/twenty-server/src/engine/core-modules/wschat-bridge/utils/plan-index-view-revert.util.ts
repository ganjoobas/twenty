export type WschatBridgeRevertViewField = {
  id: string;
  fieldName: string;
  isSystemSideEffect: boolean;
  hasOverrides: boolean;
  basePosition: number;
  baseIsVisible: boolean;
  effectiveIsVisible: boolean;
};

export type WschatBridgeIndexViewRevertPlan =
  | { kind: 'unchanged' }
  | { kind: 'skipped' }
  | {
      kind: 'revert';
      // Rewritten to their base values, which drops the overrides (dispatchUpdateToAuthoredOverride)
      toUpdate: { id: string; position: number; isVisible: boolean }[];
      // Columns the old reshape added to the INDEX view
      toDelete: string[];
    };

// Undoes what version 2 did to an INDEX view, only while it is still exactly that: our name over
// the template and our columns shown; anything else is the company's and is left alone
export const planIndexViewRevert = ({
  effectiveViewName,
  baseViewName,
  ourViewNames,
  ourFieldNames,
  viewFields,
}: {
  effectiveViewName: string;
  baseViewName: string;
  ourViewNames: string[];
  ourFieldNames: string[];
  viewFields: WschatBridgeRevertViewField[];
}): WschatBridgeIndexViewRevertPlan => {
  if (effectiveViewName === baseViewName) {
    return { kind: 'unchanged' };
  }

  const shownFieldNames = viewFields
    .filter(({ effectiveIsVisible }) => effectiveIsVisible)
    .map(({ fieldName }) => fieldName)
    .sort();

  if (
    !ourViewNames.includes(effectiveViewName) ||
    shownFieldNames.join(',') !== [...ourFieldNames].sort().join(',')
  ) {
    return { kind: 'skipped' };
  }

  return {
    kind: 'revert',
    toUpdate: viewFields
      .filter(
        ({ isSystemSideEffect, hasOverrides }) =>
          isSystemSideEffect && hasOverrides,
      )
      .map(({ id, basePosition, baseIsVisible }) => ({
        id,
        position: basePosition,
        isVisible: baseIsVisible,
      })),
    toDelete: viewFields
      .filter(
        ({ isSystemSideEffect, fieldName }) =>
          !isSystemSideEffect && ourFieldNames.includes(fieldName),
      )
      .map(({ id }) => id),
  };
};
