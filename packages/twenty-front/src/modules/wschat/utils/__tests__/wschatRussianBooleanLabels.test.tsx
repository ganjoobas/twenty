import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';

import { BooleanDisplay } from '@/ui/field/display/components/BooleanDisplay';
import { messages as russianMessages } from '~/locales/generated/ru-RU';

// The compiled catalog; the .po the image compiles from is checked by wschatRussianCatalogFixes.test.ts
describe('Russian boolean labels', () => {
  beforeAll(() => {
    i18n.load('ru-RU', russianMessages);
    i18n.activate('ru-RU');
  });

  it.each([
    [true, 'Да'],
    [false, 'Нет'],
  ])('shows %s as «%s»', (value, label) => {
    render(
      <I18nProvider i18n={i18n}>
        <BooleanDisplay value={value} />
      </I18nProvider>,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
