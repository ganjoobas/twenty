import { IsString, MaxLength, MinLength } from 'class-validator';

export class WschatBridgeDeleteWorkspaceInput {
  // Must equal the workspace's current subdomain, so a wrong id from the caller deletes nothing
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  confirmSubdomain: string;
}
