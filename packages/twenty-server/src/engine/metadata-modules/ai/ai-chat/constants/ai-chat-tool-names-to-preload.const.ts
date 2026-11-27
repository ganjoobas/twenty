import { ATTACH_CONVERSATION_TO_RECORDS_TOOL_NAME } from 'twenty-shared/ai';

import { COMMON_PRELOAD_TOOLS } from 'src/engine/core-modules/tool-provider/constants/common-preload-tools.const';
import { ADD_WSCHAT_STEP_TOOL_NAME } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-add-step-tool-name.constant';

export const AI_CHAT_TOOL_NAMES_TO_PRELOAD: string[] = [
  ...COMMON_PRELOAD_TOOLS,
  'app_exa_web_search',
  'read_file',
  ATTACH_CONVERSATION_TO_RECORDS_TOOL_NAME,
  // WSChat fork: its description carries the no-loop rules, so the chat sees it before building a workflow
  ADD_WSCHAT_STEP_TOOL_NAME,
];
