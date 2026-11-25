import {
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class WschatBridgeCreateApiKeyInput {
  @IsString()
  @MaxLength(100)
  @Matches(/\S/, { message: 'name must not be blank' })
  name: string;

  // Must lie in the future (checked by the service); absent means Twenty's "Never" (100 years)
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
