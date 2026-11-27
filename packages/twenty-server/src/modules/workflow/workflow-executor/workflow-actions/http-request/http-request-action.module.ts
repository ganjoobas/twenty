import { Module } from '@nestjs/common';

import { ToolModule } from 'src/engine/core-modules/tool/tool.module';
import { WschatBridgeActionsTargetModule } from 'src/engine/core-modules/wschat-bridge/wschat-bridge-actions-target.module';
import { HttpRequestWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/http-request/http-request.workflow-action';
import { WorkflowRunModule } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run.module';

@Module({
  imports: [ToolModule, WorkflowRunModule, WschatBridgeActionsTargetModule],
  providers: [HttpRequestWorkflowAction],
  exports: [HttpRequestWorkflowAction],
})
export class HttpRequestActionModule {}
