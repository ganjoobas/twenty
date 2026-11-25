import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class WschatBridgeEnforceInput {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/\S/, { message: 'adminRoleLabel must not be blank' })
  adminRoleLabel?: string;
}
