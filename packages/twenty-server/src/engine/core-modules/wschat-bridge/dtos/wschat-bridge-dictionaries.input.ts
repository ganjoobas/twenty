import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { TAG_COLORS } from 'twenty-shared/constants';
import { type TagColor } from 'twenty-shared/types';

import {
  WSCHAT_BRIDGE_LOCALES,
  type WschatBridgeLocale,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-data-model.constant';

// Shape only; key pattern, label limits and duplicates are checked by the service (DICTIONARY_INVALID)
export class WschatBridgeDictionaryItemInput {
  @IsString()
  key: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsIn([...TAG_COLORS], {
    message: `color must be one of: ${TAG_COLORS.join(', ')}`,
  })
  color?: TagColor;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class WschatBridgeDictionariesInput {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => WschatBridgeDictionaryItemInput)
  outcomes?: WschatBridgeDictionaryItemInput[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => WschatBridgeDictionaryItemInput)
  taskTypes?: WschatBridgeDictionaryItemInput[];

  // Language of the archive suffix only; labels themselves come as sent
  @IsOptional()
  @IsIn([...WSCHAT_BRIDGE_LOCALES])
  locale?: WschatBridgeLocale;
}
