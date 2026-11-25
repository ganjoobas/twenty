import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import {
  WSCHAT_BRIDGE_LOCALES,
  type WschatBridgeLocale,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';

export class WschatBridgeEnforceInput {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/\S/, { message: 'adminRoleLabel must not be blank' })
  adminRoleLabel?: string;

  // Labels of the WSChat objects and fields; on enforce, absent leaves the current labels as they are
  @IsOptional()
  @IsIn([...WSCHAT_BRIDGE_LOCALES], {
    message: `locale must be one of: ${WSCHAT_BRIDGE_LOCALES.join(', ')}`,
  })
  locale?: WschatBridgeLocale;
}
