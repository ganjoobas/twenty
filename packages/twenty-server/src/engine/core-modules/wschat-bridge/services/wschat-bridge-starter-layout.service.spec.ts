import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import {
  WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION,
  WSCHAT_BRIDGE_STARTER_VIEWS,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-starter-layout.constant';
import { WschatBridgeStarterLayoutService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-starter-layout.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const ACTIONS = { url: 'https://wschat.org/crm-actions/v1', token: 'secret' };
const STATUS_FIELD_ID = 'status-field';
const TASK_STATUS_UID = STANDARD_OBJECTS.task.fields.status.universalIdentifier;

describe('WschatBridgeStarterLayoutService', () => {
  let storedVersion: number | undefined;
  let statusLabels: string[];

  const keyValuePairService = {
    get: jest.fn(async () =>
      storedVersion === undefined ? [] : [{ value: storedVersion }],
    ),
    set: jest.fn(async ({ value }: { value: number }) => {
      storedVersion = value;
    }),
  };
  const workspaceCacheService = {
    getOrRecompute: jest.fn(async () => ({
      flatFieldMetadataMaps: {
        byUniversalIdentifier: {
          [TASK_STATUS_UID]: {
            id: STATUS_FIELD_ID,
            type: 'SELECT',
            options: ['TODO', 'IN_PROGRESS', 'DONE'].map((value, position) => ({
              id: value,
              value,
              label: statusLabels[position],
              color: 'sky',
              position,
            })),
          },
        },
      },
      flatFieldMetadataOptionMaps: { byUniversalIdentifier: {} },
    })),
  };
  const fieldMetadataService = { updateOneField: jest.fn(async () => ({})) };
  const starterViewsService = {
    createIfMissing: jest.fn(
      async (_args: { definition: { reportName: string } }) => true,
    ),
  };

  const starterIndexViewsService = {
    apply: jest.fn(
      async ({
        definition,
      }: {
        definition: { reportName: string };
      }): Promise<'changed' | 'unchanged' | 'skipped'> =>
        definition.reportName === 'wschatCall.main' ? 'skipped' : 'changed',
    ),
  };

  const sampleWorkflowsService = {
    deactivateFactoryWorkflows: jest.fn(async () => ({
      deactivated: ['workflow.createCompanyFromPerson'],
      skipped: ['workflow.quickLead'],
    })),
  };

  const sampleActionWorkflowsService = {
    createSamples: jest.fn(async () => [
      'workflowSample.missedCallTask',
      'workflowSample.closedConversationMessage',
      'workflowSample.scheduledReminder',
    ]),
  };

  const indexViewRevertService = {
    revert: jest.fn(
      async ({
        definition,
      }: {
        definition: { reportName: string };
      }): Promise<'changed' | 'unchanged' | 'skipped'> =>
        definition.reportName === 'wschatConversation.main'
          ? 'changed'
          : 'skipped',
    ),
  };

  const service = new WschatBridgeStarterLayoutService(
    keyValuePairService as never,
    workspaceCacheService as never,
    fieldMetadataService as never,
    starterViewsService as never,
    starterIndexViewsService as never,
    sampleWorkflowsService as never,
    sampleActionWorkflowsService as never,
    indexViewRevertService as never,
  );

  beforeEach(() => {
    storedVersion = undefined;
    statusLabels = ['To do', 'In progress', 'Done'];
    jest.clearAllMocks();
  });

  it('should create every starter view once and remember the version', async () => {
    const first = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
      actions: ACTIONS,
    });

    expect(first.starterLayoutCreated).toEqual([
      ...WSCHAT_BRIDGE_STARTER_VIEWS.map(({ reportName }) => reportName),
      'workflowSample.missedCallTask',
      'workflowSample.closedConversationMessage',
      'workflowSample.scheduledReminder',
    ]);
    expect(first.starterLayoutVersion).toBe(
      WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION,
    );
    expect(storedVersion).toBe(WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION);

    starterViewsService.createIfMissing.mockClear();
    starterIndexViewsService.apply.mockClear();
    sampleWorkflowsService.deactivateFactoryWorkflows.mockClear();
    sampleActionWorkflowsService.createSamples.mockClear();

    // A company that deleted our views does not get them back
    const second = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
      actions: ACTIONS,
    });

    expect(starterViewsService.createIfMissing).not.toHaveBeenCalled();
    expect(starterIndexViewsService.apply).not.toHaveBeenCalled();
    expect(
      sampleWorkflowsService.deactivateFactoryWorkflows,
    ).not.toHaveBeenCalled();
    expect(sampleActionWorkflowsService.createSamples).not.toHaveBeenCalled();
    expect(second.starterLayoutCreated).toEqual([]);
  });

  it('should give a workspace at version 4 only the main views of versions 5 and 6', async () => {
    storedVersion = 4;

    const result = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
      actions: ACTIONS,
    });

    expect(starterViewsService.createIfMissing).not.toHaveBeenCalled();
    expect(sampleActionWorkflowsService.createSamples).not.toHaveBeenCalled();
    expect(
      starterIndexViewsService.apply.mock.calls.map(
        ([{ definition }]) => definition.reportName,
      ),
    ).toEqual([
      'wschatConversation.main',
      'wschatCall.main',
      'task.index',
      'task.byType.show',
    ]);
    expect(result.starterLayoutChanged).toEqual([
      'wschatConversation.index',
      'wschatConversation.main',
      'task.index',
      'task.byType.show',
    ]);
    expect(result.starterLayoutSkipped).toEqual([
      'wschatCall.index',
      'wschatCall.main',
    ]);
    expect(storedVersion).toBe(6);
  });

  it('should give a workspace at version 2 only the workflow switch-off, and keep 2 if it fails', async () => {
    storedVersion = 2;
    sampleWorkflowsService.deactivateFactoryWorkflows.mockRejectedValueOnce(
      new Error('locked'),
    );

    const result = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
      actions: ACTIONS,
    });

    expect(starterIndexViewsService.apply).not.toHaveBeenCalled();
    expect(result.starterLayoutFailed).toEqual(['workflows: locked']);
    expect(storedVersion).toBe(2);
  });

  it('should keep version 1 when a main view fails', async () => {
    storedVersion = 1;
    starterIndexViewsService.apply.mockRejectedValueOnce(new Error('busy'));

    const result = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
      actions: ACTIONS,
    });

    expect(result.starterLayoutFailed).toEqual(['person.index: busy']);
    expect(result.starterLayoutVersion).toBe(1);
    expect(storedVersion).toBe(1);
  });

  it('should keep the version and report the view when one fails, then finish on the next call', async () => {
    starterViewsService.createIfMissing.mockImplementation(
      async ({ definition }: { definition: { reportName: string } }) => {
        if (definition.reportName === 'wschatCall.missed') {
          throw new Error('boom');
        }

        return true;
      },
    );

    const failed = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
      actions: ACTIONS,
    });

    expect(failed.starterLayoutFailed).toEqual(['wschatCall.missed: boom']);
    expect(failed.starterLayoutVersion).toBe(0);
    expect(storedVersion).toBeUndefined();

    starterViewsService.createIfMissing.mockImplementation(async () => false);

    const finished = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
      actions: ACTIONS,
    });

    expect(finished.starterLayoutFailed).toEqual([]);
    expect(storedVersion).toBe(WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION);
  });

  it('should translate shipped status labels and leave a changed one, values untouched', async () => {
    statusLabels = ['To do', 'Делаем', 'Done'];

    const result = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
      actions: ACTIONS,
    });

    expect(result.starterLayoutRelabelled).toContain('task.status');
    expect(fieldMetadataService.updateOneField).toHaveBeenCalledWith({
      updateFieldInput: {
        id: STATUS_FIELD_ID,
        options: [
          expect.objectContaining({ value: 'TODO', label: 'Открыта' }),
          expect.objectContaining({ value: 'IN_PROGRESS', label: 'Делаем' }),
          expect.objectContaining({ value: 'DONE', label: 'Выполнена' }),
        ],
      },
      workspaceId: WORKSPACE_ID,
      shouldDeferActions: false,
    });
  });

  it('should not touch labels in English and never throw', async () => {
    keyValuePairService.get.mockRejectedValueOnce(new Error('db down'));

    const result = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'en',
      actions: ACTIONS,
    });

    expect(fieldMetadataService.updateOneField).not.toHaveBeenCalled();
    expect(result.starterLayoutFailed).toEqual(['views: db down']);
  });

  it('should create the action samples once, and wait for a call bringing actions', async () => {
    storedVersion = 3;

    const withoutActions = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
    });

    expect(sampleActionWorkflowsService.createSamples).not.toHaveBeenCalled();
    expect(withoutActions.starterLayoutFailed).toEqual([]);
    expect(withoutActions.starterLayoutVersion).toBe(3);

    const withActions = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
      actions: ACTIONS,
    });

    expect(sampleActionWorkflowsService.createSamples).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      target: ACTIONS,
      locale: 'ru',
    });
    expect(withActions.starterLayoutCreated).toEqual([
      'workflowSample.missedCallTask',
      'workflowSample.closedConversationMessage',
      'workflowSample.scheduledReminder',
    ]);
    expect(storedVersion).toBe(6);
  });

  // The live defect of image 11: creation brings no actions, so nothing was recorded and every enforce
  // walked version 1 again (and would have recreated views the company deleted)
  it('should go from creation to version 5 across enforce calls without redoing a step', async () => {
    const creation = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
    });

    expect(creation.starterLayoutVersion).toBe(3);
    expect(storedVersion).toBe(3);
    expect(sampleActionWorkflowsService.createSamples).not.toHaveBeenCalled();

    jest.clearAllMocks();

    const enforceWithoutActions = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
    });

    expect(starterViewsService.createIfMissing).not.toHaveBeenCalled();
    expect(starterIndexViewsService.apply).not.toHaveBeenCalled();
    expect(
      sampleWorkflowsService.deactivateFactoryWorkflows,
    ).not.toHaveBeenCalled();
    expect(enforceWithoutActions.starterLayoutVersion).toBe(3);

    const enforceWithActions = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
      actions: ACTIONS,
    });

    expect(sampleActionWorkflowsService.createSamples).toHaveBeenCalledTimes(1);
    expect(enforceWithActions.starterLayoutVersion).toBe(
      WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION,
    );
    expect(storedVersion).toBe(WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION);

    jest.clearAllMocks();

    const again = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
      actions: ACTIONS,
    });

    expect(starterViewsService.createIfMissing).not.toHaveBeenCalled();
    expect(starterIndexViewsService.apply).not.toHaveBeenCalled();
    expect(sampleActionWorkflowsService.createSamples).not.toHaveBeenCalled();
    expect(again.starterLayoutCreated).toEqual([]);
  });
});
