import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { APP_LOCALES, type AppLocale } from 'twenty-shared/translations';

import { WSCHAT_BRIDGE_COLOR_SCHEMES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-color-schemes.constant';

const SUPPORTED_LOCALES = Object.keys(APP_LOCALES);

export class WschatBridgeLoginLinkInput {
  @IsUUID()
  workspaceId: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  // In-app path only: a leading "//" or a backslash would let browsers resolve it to another host
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^\/(?![/\\])[^\\\s]*$/, {
    message: 'returnToPath must be a relative path starting with a single "/"',
  })
  returnToPath?: string;

  @IsOptional()
  @IsIn(SUPPORTED_LOCALES, {
    message: `locale must be one of: ${SUPPORTED_LOCALES.join(', ')}`,
  })
  locale?: AppLocale;

  @IsOptional()
  @IsIn([...WSCHAT_BRIDGE_COLOR_SCHEMES], {
    message: `colorScheme must be one of: ${WSCHAT_BRIDGE_COLOR_SCHEMES.join(', ')}`,
  })
  colorScheme?: (typeof WSCHAT_BRIDGE_COLOR_SCHEMES)[number];
}
