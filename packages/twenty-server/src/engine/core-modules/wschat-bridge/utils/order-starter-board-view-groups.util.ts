export type WschatBridgeBoardViewGroup = {
  id: string;
  fieldValue: string;
  position: number;
  isVisible: boolean;
};

// Upstream appends a column for each new option after every existing one, the placeholder and
// "no value" included. Ours keep the board's own order for known values, then the new ones in
// dictionary order, then the hidden placeholder and "no value" last. Returns only groups that change.
export const orderStarterBoardViewGroups = ({
  viewGroups,
  optionValues,
  previousOptionValues,
  placeholderValue,
}: {
  viewGroups: WschatBridgeBoardViewGroup[];
  optionValues: string[];
  previousOptionValues: string[];
  placeholderValue: string;
}): WschatBridgeBoardViewGroup[] => {
  const isTail = ({ fieldValue }: WschatBridgeBoardViewGroup) =>
    fieldValue === placeholderValue || fieldValue === '';
  const isNew = ({ fieldValue }: WschatBridgeBoardViewGroup) =>
    !previousOptionValues.includes(fieldValue);
  const byPosition = (
    first: WschatBridgeBoardViewGroup,
    second: WschatBridgeBoardViewGroup,
  ) => first.position - second.position;
  const byDictionaryOrder = (
    first: WschatBridgeBoardViewGroup,
    second: WschatBridgeBoardViewGroup,
  ) =>
    optionValues.indexOf(first.fieldValue) -
    optionValues.indexOf(second.fieldValue);

  const ordered = [
    ...viewGroups
      .filter((viewGroup) => !isTail(viewGroup) && !isNew(viewGroup))
      .sort(byPosition),
    ...viewGroups
      .filter((viewGroup) => !isTail(viewGroup) && isNew(viewGroup))
      .sort(byDictionaryOrder),
    ...viewGroups.filter(({ fieldValue }) => fieldValue === placeholderValue),
    ...viewGroups.filter(({ fieldValue }) => fieldValue === ''),
  ];

  return ordered
    .map((viewGroup, position) => ({
      ...viewGroup,
      position,
      isVisible:
        viewGroup.fieldValue === placeholderValue ? false : viewGroup.isVisible,
    }))
    .filter((viewGroup) => {
      const before = viewGroups.find(({ id }) => id === viewGroup.id);

      return (
        before?.position !== viewGroup.position ||
        before.isVisible !== viewGroup.isVisible
      );
    });
};
