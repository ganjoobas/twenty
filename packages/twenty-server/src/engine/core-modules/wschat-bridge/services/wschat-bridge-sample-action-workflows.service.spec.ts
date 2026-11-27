import { WschatBridgeSampleActionWorkflowsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-sample-action-workflows.service';

jest.mock(
  'src/engine/core-modules/application/application-manifest/converters/from-workflow-trigger-manifest-to-trigger-or-throw.util',
  () => ({
    fromWorkflowTriggerManifestToTriggerOrThrow: ({
      trigger,
    }: {
      trigger: { type: string };
    }) => ({ type: trigger.type }),
  }),
);
jest.mock(
  'src/engine/core-modules/application/application-manifest/converters/from-workflow-step-manifest-to-action-or-throw.util',
  () => ({
    fromWorkflowStepManifestToActionOrThrow: ({
      step,
    }: {
      step: { type: string };
    }) => ({ type: step.type }),
  }),
);

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const TARGET = { url: 'https://wschat.org/crm-actions/v1', token: 'tok' };

describe('WschatBridgeSampleActionWorkflowsService', () => {
  let existingNames: string[];

  const workspaceRepository = {
    query: jest.fn(async () => existingNames.map((name) => ({ name }))),
  };
  const coreWorkflowMutationService = {
    createWorkflowWithContent: jest.fn(async () => ({})),
  };
  const flatEntityMapsCacheService = {
    getOrRecomputeManyOrAllFlatEntityMaps: jest.fn(async () => ({
      flatObjectMetadataMaps: { byUniversalIdentifier: {} },
      flatFieldMetadataMaps: { byUniversalIdentifier: {} },
    })),
  };
  const service = new WschatBridgeSampleActionWorkflowsService(
    workspaceRepository as never,
    coreWorkflowMutationService as never,
    flatEntityMapsCacheService as never,
  );

  beforeEach(() => {
    existingNames = [];
    jest.clearAllMocks();
  });

  it('should create the three samples as drafts through upstream, as no user', async () => {
    await expect(
      service.createSamples({
        workspaceId: WORKSPACE_ID,
        target: TARGET,
        locale: 'ru',
      }),
    ).resolves.toEqual([
      'workflowSample.missedCallTask',
      'workflowSample.closedConversationMessage',
      'workflowSample.scheduledReminder',
    ]);
    expect(
      coreWorkflowMutationService.createWorkflowWithContent,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: undefined,
        name: 'Напоминание клиенту по расписанию',
        trigger: expect.objectContaining({ type: 'CRON' }),
        steps: [
          { type: 'FIND_RECORDS' },
          { type: 'ITERATOR' },
          { type: 'HTTP_REQUEST' },
        ],
        edges: [],
      }),
    );
  });

  it('should skip a sample already there from a run that stopped part-way', async () => {
    existingNames = ['Пропущенный звонок → задача «Перезвонить» в WSChat'];

    await expect(
      service.createSamples({
        workspaceId: WORKSPACE_ID,
        target: TARGET,
        locale: 'ru',
      }),
    ).resolves.toEqual([
      'workflowSample.closedConversationMessage',
      'workflowSample.scheduledReminder',
    ]);
    expect(
      coreWorkflowMutationService.createWorkflowWithContent,
    ).toHaveBeenCalledTimes(2);
  });
});
