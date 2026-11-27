import { WschatBridgeSampleWorkflowsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-sample-workflows.service';
import { getWorkflowPrefillIds } from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-workflows.util';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const IDS = getWorkflowPrefillIds(WORKSPACE_ID);

describe('WschatBridgeSampleWorkflowsService', () => {
  let versionsByWorkflowId: Record<string, { id: string; status: string }[]>;

  const workspaceRepository = {
    query: jest.fn(
      async (_sql: string, [, workflowId]: [string, string]) =>
        versionsByWorkflowId[workflowId] ?? [],
    ),
  };
  const lifecycleService = {
    deactivateCoreWorkflowVersion: jest.fn(async () => true),
  };
  const service = new WschatBridgeSampleWorkflowsService(
    workspaceRepository as never,
    lifecycleService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    versionsByWorkflowId = {
      [IDS.coreQuickLeadWorkflowId]: [
        { id: IDS.coreQuickLeadWorkflowVersionId, status: 'ACTIVE' },
      ],
      [IDS.coreCreateCompanyWorkflowId]: [
        { id: IDS.coreCreateCompanyWorkflowVersionId, status: 'ACTIVE' },
      ],
    };
  });

  it('should switch off both shipped workflows through the Deactivate service', async () => {
    await expect(
      service.deactivateFactoryWorkflows(WORKSPACE_ID),
    ).resolves.toEqual({
      deactivated: ['workflow.quickLead', 'workflow.createCompanyFromPerson'],
      skipped: [],
    });
    expect(lifecycleService.deactivateCoreWorkflowVersion).toHaveBeenCalledWith(
      {
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: undefined,
        coreWorkflowVersionId: IDS.coreCreateCompanyWorkflowVersionId,
      },
    );
  });

  it('should leave alone a workflow the company edited, one already off and one deleted', async () => {
    versionsByWorkflowId[IDS.coreQuickLeadWorkflowId].push({
      id: 'company-draft',
      status: 'DRAFT',
    });
    versionsByWorkflowId[IDS.coreCreateCompanyWorkflowId] = [
      { id: IDS.coreCreateCompanyWorkflowVersionId, status: 'DEACTIVATED' },
    ];

    await expect(
      service.deactivateFactoryWorkflows(WORKSPACE_ID),
    ).resolves.toEqual({ deactivated: [], skipped: ['workflow.quickLead'] });

    versionsByWorkflowId = {};

    await expect(
      service.deactivateFactoryWorkflows(WORKSPACE_ID),
    ).resolves.toEqual({ deactivated: [], skipped: [] });
    expect(
      lifecycleService.deactivateCoreWorkflowVersion,
    ).not.toHaveBeenCalled();
  });
});
