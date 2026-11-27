import { IsString, IsUrl, Matches, MaxLength } from 'class-validator';

// WSChat's endpoint for actions taken by CRM workflows, and this workspace's token for it
export class WschatBridgeActionsInput {
  @IsUrl({
    require_protocol: true,
    protocols: ['https', 'http'],
    require_tld: false,
  })
  @MaxLength(500)
  url: string;

  @IsString()
  @MaxLength(500)
  @Matches(/^\S+$/, { message: 'token must be one word' })
  token: string;
}
