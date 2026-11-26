import { type WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { type WschatBridgeMemberDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-member.dto';

export class WschatBridgeCreatedWorkspaceDTO {
  workspaceId: string;

  subdomain: string;

  url: string;
}

export class WschatBridgeCreateWorkspaceResultDTO extends WschatBridgeCreatedWorkspaceDTO {
  // false: the workspace is usable, but the WSChat data model is not complete yet; repeat enforce until true
  dataModelReady: boolean;
}

export class WschatBridgeWorkspaceDTO extends WschatBridgeCreatedWorkspaceDTO {
  displayName: string;

  activationStatus: WorkspaceActivationStatus;

  assistantsEnabled: boolean;

  members: WschatBridgeMemberDTO[];
}
