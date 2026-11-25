import { isNonEmptyString } from '@sniptt/guards';
import { type TelemetryOptions } from 'ai';

import { AI_TELEMETRY_CONFIG } from 'src/engine/metadata-modules/ai/ai-models/constants/ai-telemetry.constant';

type BuildAiTelemetryArgs = {
  functionId: string;
  isContentRecordingAllowed: boolean;
  workspaceId?: string;
  userWorkspaceId?: string | null;
  agentId?: string | null;
  threadId?: string;
  turnId?: string;
  streamId?: string;
};

type AiTelemetryCallOptions = {
  telemetry: TelemetryOptions<Record<string, string>>;
  runtimeContext: Record<string, string>;
  headers: Record<string, string>;
};

// WSChat fork: lets a metering proxy behind an openai-compatible provider attribute each call; other providers ignore them
const buildWschatAttributionHeaders = ({
  functionId,
  workspaceId,
  userWorkspaceId,
  agentId,
}: Pick<
  BuildAiTelemetryArgs,
  'functionId' | 'workspaceId' | 'userWorkspaceId' | 'agentId'
>): Record<string, string> => ({
  'X-WSChat-Feature': functionId,
  ...(isNonEmptyString(workspaceId) && {
    'X-WSChat-Workspace-Id': workspaceId,
  }),
  ...(isNonEmptyString(userWorkspaceId) && {
    'X-WSChat-User-Workspace-Id': userWorkspaceId,
  }),
  ...(isNonEmptyString(agentId) && { 'X-WSChat-Agent-Id': agentId }),
});

// telemetry integrations only receive per-call attributes opted in from runtime context
export const buildAiTelemetry = ({
  functionId,
  isContentRecordingAllowed,
  ...identifiers
}: BuildAiTelemetryArgs): AiTelemetryCallOptions => {
  const runtimeContext = Object.fromEntries(
    Object.entries(identifiers).filter(([, value]) => isNonEmptyString(value)),
  ) as Record<string, string>;

  return {
    telemetry: {
      ...AI_TELEMETRY_CONFIG,
      recordInputs: isContentRecordingAllowed,
      recordOutputs: isContentRecordingAllowed,
      functionId,
      includeRuntimeContext: Object.fromEntries(
        Object.keys(runtimeContext).map((key) => [key, true]),
      ),
    },
    runtimeContext,
    headers: buildWschatAttributionHeaders({ functionId, ...identifiers }),
  };
};
