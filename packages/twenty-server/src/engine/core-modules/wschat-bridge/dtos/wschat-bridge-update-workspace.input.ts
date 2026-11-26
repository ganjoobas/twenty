import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

// Every field is optional; an absent field is left as it is, an empty origins array clears the list
export class WschatBridgeUpdateWorkspaceInput {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'displayName must not be blank' })
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subdomain?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  allowedEmbeddingOrigins?: string[];

  // As in enforce; lets WSChat close assistants without running a full enforce
  @IsOptional()
  @IsBoolean()
  assistantsEnabled?: boolean;
}
