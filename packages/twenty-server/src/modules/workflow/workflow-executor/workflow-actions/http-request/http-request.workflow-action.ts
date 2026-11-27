import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';
import { type WorkflowRunStepLog } from 'twenty-shared/workflow';

import { HttpTool } from 'src/engine/core-modules/tool/tools/http-tool/http-tool';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';
import { WschatBridgeActionsTargetService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-actions-target.service';
import {
  WorkflowStepExecutorException,
  WorkflowStepExecutorExceptionCode,
} from 'src/modules/workflow/workflow-executor/exceptions/workflow-step-executor.exception';
import { type WorkflowRunInfo } from 'src/modules/workflow/workflow-executor/types/workflow-action-input.type';
import { isWorkflowHttpRequestAction } from 'src/modules/workflow/workflow-executor/workflow-actions/http-request/guards/is-workflow-http-request-action.guard';
import { type WorkflowHttpRequestActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/http-request/types/workflow-http-request-action-input.type';
import { buildHttpRequestStepLog } from 'src/modules/workflow/workflow-executor/workflow-actions/http-request/utils/build-http-request-step-log.util';
import { ToolBackedWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/tool-backed/tool-backed.workflow-action';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';
import { WorkflowRunStepLogWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run-step-log.workspace-service';

// Inputs that got WSChat's token, so their request follows no redirect; weak, so nothing outlives the run
const WSCHAT_AUTHORIZED_INPUTS = new WeakSet<WorkflowHttpRequestActionInput>();

@Injectable()
export class HttpRequestWorkflowAction extends ToolBackedWorkflowAction<WorkflowHttpRequestActionInput> {
  constructor(
    private readonly httpTool: HttpTool,
    workflowRunStepLogService: WorkflowRunStepLogWorkspaceService,
    private readonly wschatActionsTargetService: WschatBridgeActionsTargetService,
  ) {
    super(HttpRequestWorkflowAction.name, workflowRunStepLogService);
  }

  protected getTool(): Tool {
    return this.httpTool;
  }

  protected assertStep(step: WorkflowAction): void {
    if (!isWorkflowHttpRequestAction(step)) {
      throw new WorkflowStepExecutorException(
        'Step is not an HTTP request action',
        WorkflowStepExecutorExceptionCode.INVALID_STEP_TYPE,
      );
    }
  }

  // WSChat fork: steps calling the workspace's WSChat endpoint carry no token, it is added here (wschat-bridge README, "WSChat token")
  protected override async postprocessInput(
    input: WorkflowHttpRequestActionInput,
    workspaceId: string,
  ): Promise<WorkflowHttpRequestActionInput> {
    const authorized = await this.wschatActionsTargetService.authorizeRequest({
      workspaceId,
      input,
    });

    if (!isDefined(authorized)) {
      return input;
    }

    WSCHAT_AUTHORIZED_INPUTS.add(authorized);

    return authorized;
  }

  protected override async buildToolExecutionContext(
    runInfo: WorkflowRunInfo,
    stepId: string,
    input: WorkflowHttpRequestActionInput,
  ): Promise<ToolExecutionContext> {
    return {
      workspaceId: runInfo.workspaceId,
      workflowRunId: runInfo.workflowRunId,
      workflowStepId: stepId,
      outboundRequestSource: 'workflow-http',
      ...(WSCHAT_AUTHORIZED_INPUTS.has(input) && { maxRedirects: 0 }),
    };
  }

  protected buildStepLog({
    input,
    output,
    durationMs,
  }: {
    input: WorkflowHttpRequestActionInput;
    output: ToolOutput;
    durationMs: number;
  }): WorkflowRunStepLog {
    return buildHttpRequestStepLog({ input, output, durationMs });
  }
}
