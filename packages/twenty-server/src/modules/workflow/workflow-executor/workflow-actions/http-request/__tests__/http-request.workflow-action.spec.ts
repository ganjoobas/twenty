import { Test, type TestingModule } from '@nestjs/testing';

import { WorkflowActionType } from 'twenty-shared/workflow';
import { HttpTool } from 'src/engine/core-modules/tool/tools/http-tool/http-tool';
import { WschatBridgeActionsTargetService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-actions-target.service';
import { HttpRequestWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/http-request/http-request.workflow-action';
import { type WorkflowActionSettings } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action-settings.type';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';
import { WorkflowRunStepLogWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run-step-log.workspace-service';

const baseSettings: WorkflowActionSettings = {
  outputSchema: {},
  errorHandlingOptions: {
    retryOnFailure: { value: 0 },
    continueOnFailure: { value: false },
  },
  input: {},
};

const buildHttpRequestStep = (input: Record<string, unknown>): WorkflowAction =>
  ({
    id: 'step-1',
    type: WorkflowActionType.HTTP_REQUEST,
    name: 'HTTP Request',
    valid: true,
    settings: { ...baseSettings, input },
  }) as WorkflowAction;

describe('HttpRequestWorkflowAction', () => {
  let action: HttpRequestWorkflowAction;
  let mockHttpTool: jest.Mocked<Pick<HttpTool, 'execute'>>;
  let mockSetStepLog: jest.Mock;
  let wschatTargets: Record<string, { url: string; token: string }>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockHttpTool = {
      execute: jest.fn().mockResolvedValue({
        result: { ok: true },
        error: undefined,
        status: 200,
      }),
    };
    mockSetStepLog = jest.fn();
    wschatTargets = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HttpRequestWorkflowAction,
        { provide: HttpTool, useValue: mockHttpTool },
        {
          provide: WorkflowRunStepLogWorkspaceService,
          useValue: { setStepLog: mockSetStepLog },
        },
        {
          provide: WschatBridgeActionsTargetService,
          useValue: new WschatBridgeActionsTargetService({
            get: async ({ workspaceId }: { workspaceId: string }) =>
              workspaceId in wschatTargets
                ? [{ value: wschatTargets[workspaceId] }]
                : [],
          } as never),
        },
      ],
    }).compile();

    action = module.get(HttpRequestWorkflowAction);
  });

  it('resolves variables in the request input and forwards them to the HTTP tool with the run and step', async () => {
    await action.execute({
      currentStepId: 'step-1',
      steps: [
        buildHttpRequestStep({
          url: 'https://api.example.com/users/{{trigger.id}}',
          method: 'GET',
        }),
      ],
      context: { trigger: { id: '42' } },
      runInfo: { workspaceId: 'workspace-1', workflowRunId: 'run-1' },
    });

    expect(mockHttpTool.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/users/42',
        method: 'GET',
      }),
      {
        workspaceId: 'workspace-1',
        workflowRunId: 'run-1',
        workflowStepId: 'step-1',
        outboundRequestSource: 'workflow-http',
      },
    );
  });

  it('persists an HTTP_REQUEST step log', async () => {
    await action.execute({
      currentStepId: 'step-1',
      steps: [
        buildHttpRequestStep({
          url: 'https://api.example.com/users',
          method: 'POST',
          body: { name: 'John' },
        }),
      ],
      context: {},
      runInfo: { workspaceId: 'workspace-1', workflowRunId: 'run-1' },
    });

    expect(mockSetStepLog).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: 'run-1',
        workspaceId: 'workspace-1',
        stepId: 'step-1',
        stepLog: expect.objectContaining({
          details: expect.objectContaining({ type: 'HTTP_REQUEST' }),
        }),
      }),
    );
  });

  it('throws when the current step is not an HTTP request action', async () => {
    await expect(
      action.execute({
        currentStepId: 'step-1',
        steps: [
          {
            ...buildHttpRequestStep({
              url: 'https://example.com',
              method: 'GET',
            }),
            type: WorkflowActionType.SEND_EMAIL,
          } as WorkflowAction,
        ],
        context: {},
        runInfo: { workspaceId: 'workspace-1', workflowRunId: 'run-1' },
      }),
    ).rejects.toThrow('Step is not an HTTP request action');

    expect(mockHttpTool.execute).not.toHaveBeenCalled();
  });

  describe('WSChat token', () => {
    const runWschatStep = (url: string, workspaceId = 'workspace-1') =>
      action.execute({
        currentStepId: 'step-1',
        steps: [
          buildHttpRequestStep({
            url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { text: 'Hi' },
          }),
        ],
        context: {},
        runInfo: { workspaceId, workflowRunId: 'run-1' },
      });

    beforeEach(() => {
      wschatTargets = {
        'workspace-1': {
          url: 'https://wschat.org/crm-actions/v1',
          token: 'tok_own',
        },
        'workspace-2': {
          url: 'https://evil.example.com/crm-actions/v1',
          token: 'tok_other',
        },
      };
    });

    it("adds the workspace's stored token to calls of its WSChat endpoint, follows no redirect and keeps it out of the log", async () => {
      await runWschatStep('https://wschat.org/crm-actions/v1/messages');

      expect(mockHttpTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer tok_own',
          },
        }),
        expect.objectContaining({ maxRedirects: 0 }),
      );
      expect(JSON.stringify(mockSetStepLog.mock.calls)).not.toContain(
        'tok_own',
      );
    });

    it('adds nothing for a look-alike host, another workspace or no stored target', async () => {
      await runWschatStep(
        'https://wschat.org.evil.com/crm-actions/v1/messages',
      );
      await runWschatStep('https://evil.example.com/crm-actions/v1/messages');
      await runWschatStep(
        'https://wschat.org/crm-actions/v1/messages',
        'workspace-3',
      );

      for (const [input, context] of mockHttpTool.execute.mock.calls) {
        expect(input.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(context).not.toHaveProperty('maxRedirects');
      }
    });
  });
});
