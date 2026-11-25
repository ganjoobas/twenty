import { IsEmail, MaxLength } from 'class-validator';

export class WschatBridgeRemoveMemberInput {
  @IsEmail()
  @MaxLength(255)
  email: string;
}
