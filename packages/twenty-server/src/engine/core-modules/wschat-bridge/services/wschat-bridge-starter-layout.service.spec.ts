import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import {
  WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION,
  WSCHAT_BRIDGE_STARTER_VIEWS,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-starter-layout.constant';
import { WschatBridgeStarterLayoutService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-starter-layout.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
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

  const service = new WschatBridgeStarterLayoutService(
    keyValuePairService as never,
    workspaceCacheService as never,
    fieldMetadataService as never,
    starterViewsService as never,
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
    });

    expect(first.starterLayoutCreated).toEqual(
      WSCHAT_BRIDGE_STARTER_VIEWS.map(({ reportName }) => reportName),
    );
    expect(first.starterLayoutVersion).toBe(
      WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION,
    );
    expect(storedVersion).toBe(WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION);

    starterViewsService.createIfMissing.mockClear();

    // A company that deleted our views does not get them back
    const second = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
    });

    expect(starterViewsService.createIfMissing).not.toHaveBeenCalled();
    expect(second.starterLayoutCreated).toEqual([]);
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
    });

    expect(failed.starterLayoutFailed).toEqual(['wschatCall.missed: boom']);
    expect(failed.starterLayoutVersion).toBe(0);
    expect(storedVersion).toBeUndefined();

    starterViewsService.createIfMissing.mockImplementation(async () => false);

    const finished = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
    });

    expect(finished.starterLayoutFailed).toEqual([]);
    expect(storedVersion).toBe(WSCHAT_BRIDGE_STARTER_LAYOUT_VERSION);
  });

  it('should translate shipped status labels and leave a changed one, values untouched', async () => {
    statusLabels = ['To do', 'Делаем', 'Done'];

    const result = await service.apply({
      workspaceId: WORKSPACE_ID,
      locale: 'ru',
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
    });

    expect(fieldMetadataService.updateOneField).not.toHaveBeenCalled();
    expect(result.starterLayoutFailed).toEqual(['views: db down']);
  });
});
