import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import {
  WSCHAT_BRIDGE_LOCALES,
  type WschatBridgeLocale,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';
import { WschatBridgeActionsInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-actions.input';

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

  // External assistants (MCP / OAuth); absent leaves the current state
  @IsOptional()
  @IsBoolean()
  assistantsEnabled?: boolean;

  // WSChat's actions endpoint for the sample workflows (README, "Sample action workflows"); never stored or logged
  @IsOptional()
  @ValidateNested()
  @Type(() => WschatBridgeActionsInput)
  actions?: WschatBridgeActionsInput;
}
