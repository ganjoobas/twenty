import { render, screen, waitFor } from '@testing-library/react';
import { IconsProvider, useIcons } from 'twenty-ui/icon/provider';

import { WSCHAT_BRAND_COLORS } from '@/wschat/constants/WschatBrandColors';
import { WSCHAT_ICONS } from '@/wschat/constants/WschatIcons';

const FieldIcon = ({ iconName }: { iconName: string }) => {
  const { getIcon } = useIcons();
  const FieldIconComponent = getIcon(iconName);

  return (
    <span data-testid="field-icon">
      <FieldIconComponent size={16} color="red" />
    </span>
  );
};

describe('IconWschat', () => {
  it('is found by name like any Twenty icon, in its own colours and the requested size', async () => {
    const { container } = render(
      <IconsProvider extraIcons={WSCHAT_ICONS}>
        <FieldIcon iconName="IconWschat" />
      </IconsProvider>,
    );

    await waitFor(() =>
      expect(
        container.querySelector(`path[fill="${WSCHAT_BRAND_COLORS.green}"]`),
      ).not.toBeNull(),
    );

    const svg = screen.getByTestId('field-icon').querySelector('svg');

    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
    expect(container.querySelector('[fill="red"], [stroke="red"]')).toBeNull();
  });
});
