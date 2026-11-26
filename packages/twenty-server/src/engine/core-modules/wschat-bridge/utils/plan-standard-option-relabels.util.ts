import { type WschatBridgeStandardOptionLabels } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-starter-layout.constant';
import { type WschatBridgeLocale } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';

export type WschatBridgeStandardOption = {
  id?: string;
  value: string;
  label: string;
  color: string;
  position: number;
  isActive?: boolean;
};

// The full option list to send back (values untouched), or null when nothing reads as shipped any more
export const planStandardOptionRelabels = ({
  currentOptions,
  definition,
  locale,
}: {
  currentOptions: WschatBridgeStandardOption[];
  definition: WschatBridgeStandardOptionLabels;
  locale: WschatBridgeLocale;
}): WschatBridgeStandardOption[] | null => {
  let isChanged = false;

  const options = currentOptions.map((option) => {
    const wanted = definition.options.find(
      ({ value }) => value === option.value,
    );

    if (
      wanted === undefined ||
      option.label !== wanted.factory ||
      option.label === wanted.label[locale]
    ) {
      return option;
    }

    isChanged = true;

    return { ...option, label: wanted.label[locale] };
  });

  return isChanged ? options : null;
};
