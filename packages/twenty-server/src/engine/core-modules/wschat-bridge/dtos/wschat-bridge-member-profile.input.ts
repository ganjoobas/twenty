import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { WORKSPACE_MEMBER_NAME_MAX_LENGTH } from 'twenty-shared/constants';
import { type AppLocale } from 'twenty-shared/translations';

import { WSCHAT_BRIDGE_COLOR_SCHEMES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-color-schemes.constant';
import { WSCHAT_BRIDGE_SUPPORTED_LOCALES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-supported-locales.constant';

// A person as WSChat knows them; used for the first admin of a new workspace and for member upserts
export class WschatBridgeMemberProfileInput {
  @IsEmail()
  @MaxLength(255)
  email: string;

  // Non-blank: an empty name would leave Twenty's create-profile onboarding step meaningful again
  @IsString()
  @MaxLength(WORKSPACE_MEMBER_NAME_MAX_LENGTH)
  @Matches(/\S/, { message: 'firstName must not be blank' })
  firstName: string;

  @IsString()
  @MaxLength(WORKSPACE_MEMBER_NAME_MAX_LENGTH)
  lastName: string;

  @IsOptional()
  @IsIn(WSCHAT_BRIDGE_SUPPORTED_LOCALES, {
    message: `locale must be one of: ${WSCHAT_BRIDGE_SUPPORTED_LOCALES.join(', ')}`,
  })
  locale?: AppLocale;

  @IsOptional()
  @IsIn([...WSCHAT_BRIDGE_COLOR_SCHEMES], {
    message: `colorScheme must be one of: ${WSCHAT_BRIDGE_COLOR_SCHEMES.join(', ')}`,
  })
  colorScheme?: (typeof WSCHAT_BRIDGE_COLOR_SCHEMES)[number];
}
