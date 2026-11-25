import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

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

  // Origin syntax and the 20-origin cap are checked by the service (EMBEDDING_ORIGIN_INVALID / TOO_MANY_EMBEDDING_ORIGINS)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  allowedEmbeddingOrigins?: string[];
}
