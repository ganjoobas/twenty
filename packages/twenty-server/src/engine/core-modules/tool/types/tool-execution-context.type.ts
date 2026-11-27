import { type ActorMetadata } from 'twenty-shared/types';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type OutboundRequestSource } from 'src/engine/core-modules/secure-http-client/outbound-request-source.type';
import { type CodeExecutionStreamEmitter } from 'src/engine/core-modules/tool-provider/interfaces/code-execution-stream-emitter.type';

export type ToolExecutionContext = {
  workspaceId: string;
  actorMetadata?: ActorMetadata;
  userId?: string;
  userWorkspaceId?: string;
  workspaceMemberId?: string;
  agentId?: string;
  threadId?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  outboundRequestSource?: OutboundRequestSource;
  // 0 when the request carries a credential that must not follow a redirect
  maxRedirects?: number;
  authContext?: WorkspaceAuthContext;
  onCodeExecutionUpdate?: CodeExecutionStreamEmitter;
};
