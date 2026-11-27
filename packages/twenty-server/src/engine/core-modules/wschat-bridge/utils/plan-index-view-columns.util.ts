export type WschatBridgeIndexViewField = {
  id: string;
  fieldName: string;
  position: number;
  isVisible: boolean;
  isSystemSideEffect: boolean;
  hasOverrides: boolean;
};

export type WschatBridgeIndexViewColumnsPlan = {
  toCreate: { fieldName: string; position: number }[];
  toUpdate: { id: string; position: number; isVisible: boolean }[];
};

// Edits through the app on engine-made views and columns are stored as overrides, and columns a
// company adds are not engine-made: none of them, every column shown, and the shipped name means untouched
export const isIndexViewUntouched = ({
  viewName,
  shippedViewName,
  viewHasOverrides,
  viewFields,
}: {
  viewName: string;
  shippedViewName: string;
  viewHasOverrides: boolean;
  viewFields: WschatBridgeIndexViewField[];
}): boolean =>
  viewName === shippedViewName &&
  !viewHasOverrides &&
  viewFields.every(
    ({ isSystemSideEffect, hasOverrides, isVisible }) =>
      isSystemSideEffect && !hasOverrides && isVisible,
  );

// Exactly `fieldNames` in that order; other columns are hidden after them, never deleted
export const planIndexViewReshape = ({
  viewFields,
  fieldNames,
}: {
  viewFields: WschatBridgeIndexViewField[];
  fieldNames: string[];
}): WschatBridgeIndexViewColumnsPlan => {
  const plan: WschatBridgeIndexViewColumnsPlan = { toCreate: [], toUpdate: [] };

  fieldNames.forEach((fieldName, position) => {
    const existing = viewFields.find((field) => field.fieldName === fieldName);

    if (existing === undefined) {
      plan.toCreate.push({ fieldName, position });
    } else if (existing.position !== position || !existing.isVisible) {
      plan.toUpdate.push({ id: existing.id, position, isVisible: true });
    }
  });

  viewFields
    .filter(({ fieldName }) => !fieldNames.includes(fieldName))
    .sort((first, second) => first.position - second.position)
    .forEach(({ id, isVisible, position }, index) => {
      const hiddenPosition = fieldNames.length + index;

      if (isVisible || position !== hiddenPosition) {
        plan.toUpdate.push({ id, position: hiddenPosition, isVisible: false });
      }
    });

  return plan;
};

// Columns not on the view at all (shown or hidden) go after the last one; nothing else moves
export const planIndexViewAppend = ({
  viewFields,
  fieldNames,
}: {
  viewFields: WschatBridgeIndexViewField[];
  fieldNames: string[];
}): WschatBridgeIndexViewColumnsPlan => {
  const lastPosition = Math.max(
    -1,
    ...viewFields.map(({ position }) => position),
  );

  return {
    toCreate: fieldNames
      .filter((fieldName) =>
        viewFields.every((field) => field.fieldName !== fieldName),
      )
      .map((fieldName, index) => ({
        fieldName,
        position: lastPosition + 1 + index,
      })),
    toUpdate: [],
  };
};
