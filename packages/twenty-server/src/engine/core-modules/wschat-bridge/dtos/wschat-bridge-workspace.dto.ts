import { type WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { type WschatBridgeMemberDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-member.dto';

export class WschatBridgeCreatedWorkspaceDTO {
  workspaceId: string;

  subdomain: string;

  url: string;
}

export class WschatBridgeWorkspaceDTO extends WschatBridgeCreatedWorkspaceDTO {
  displayName: string;

  activationStatus: WorkspaceActivationStatus;

  members: WschatBridgeMemberDTO[];
}
