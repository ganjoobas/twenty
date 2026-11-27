import { readFileSync } from 'fs';
import { join } from 'path';

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';

import { BooleanDisplay } from '@/ui/field/display/components/BooleanDisplay';
import { messages as russianMessages } from '~/locales/generated/ru-RU';

// The Docker build recompiles the catalog from ru-RU.po, so a Twenty update that brings back
// "Истина"/"Ложь" has to fail here, in the .po and in the compiled catalog alike
const RUSSIAN_CATALOG_PATH = join(__dirname, '../../../../locales/ru-RU.po');

const readRussianTranslation = (messageId: string) =>
  readFileSync(RUSSIAN_CATALOG_PATH, 'utf8').match(
    new RegExp(`\\nmsgid "${messageId}"\\nmsgstr "([^"]*)"`),
  )?.[1];

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

  it('keeps «Да»/«Нет» in the ru-RU.po the build compiles', () => {
    expect(readRussianTranslation('True')).toBe('Да');
    expect(readRussianTranslation('False')).toBe('Нет');
    expect(readRussianTranslation('True or false')).toBe('Да или нет');
  });
});
