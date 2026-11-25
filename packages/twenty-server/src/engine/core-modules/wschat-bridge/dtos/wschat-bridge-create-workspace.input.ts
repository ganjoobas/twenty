import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
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
import { WschatBridgeMemberProfileInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-member-profile.input';

export class WschatBridgeCreateWorkspaceInput {
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'displayName must not be blank' })
  displayName: string;

  // Format, reserved names and uniqueness are checked by the service, each with its own error code
  @IsString()
  @MaxLength(255)
  subdomain: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => WschatBridgeMemberProfileInput)
  admin: WschatBridgeMemberProfileInput;

  // Name of the company-admin role in the company's language; "Company admin" when absent
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/\S/, { message: 'adminRoleLabel must not be blank' })
  adminRoleLabel?: string;

  // Labels of the WSChat objects and fields; English when absent
  @IsOptional()
  @IsIn([...WSCHAT_BRIDGE_LOCALES], {
    message: `locale must be one of: ${WSCHAT_BRIDGE_LOCALES.join(', ')}`,
  })
  locale?: WschatBridgeLocale;

  // Origin syntax and the 20-origin cap are checked by the service (EMBEDDING_ORIGIN_INVALID / TOO_MANY_EMBEDDING_ORIGINS)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  allowedEmbeddingOrigins?: string[];
}
