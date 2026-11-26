import { WSCHAT_BRIDGE_STARTER_VIEWS } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-starter-layout.constant';
import { WschatBridgeStarterViewsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-starter-views.service';
import { buildCompleteViewChildrenFlatOperations } from 'src/engine/metadata-modules/flat-view/utils/build-complete-view-children-flat-operations.util';
import { fromCreateViewInputToFlatViewToCreate } from 'src/engine/metadata-modules/flat-view/utils/from-create-view-input-to-flat-view-to-create.util';

jest.mock(
  'src/engine/metadata-modules/flat-view/utils/from-create-view-input-to-flat-view-to-create.util',
);
jest.mock(
  'src/engine/metadata-modules/flat-view/utils/build-complete-view-children-flat-operations.util',
);

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const byReportName = (reportName: string) =>
  WSCHAT_BRIDGE_STARTER_VIEWS.find((view) => view.reportName === reportName)!;
const TASK_BY_TYPE = byReportName('task.byType');
const OPEN_CONVERSATIONS = byReportName('wschatConversation.open');

const buildMaps = (existingViewUniversalIdentifiers: string[] = []) => {
  const objectId = 'object-id';
  const fieldNames = [
    'title',
    'status',
    'dueAt',
    'assignee',
    'wschatType',
    'name',
    'person',
    'channel',
    'responsible',
    'lastMessageAt',
    'lastMessageFrom',
    'startedAt',
    'wschatUrl',
    'state',
  ];

  return {
    flatObjectMetadataMaps: {
      byUniversalIdentifier: {
        [TASK_BY_TYPE.objectUniversalIdentifier]: { id: objectId },
        [OPEN_CONVERSATIONS.objectUniversalIdentifier]: { id: objectId },
      },
    },
    flatFieldMetadataMaps: {
      byUniversalIdentifier: Object.fromEntries(
        fieldNames.map((name) => [
          `uid-${name}`,
          {
            id: `field-${name}`,
            name,
            objectMetadataId: objectId,
            isActive: true,
          },
        ]),
      ),
    },
    flatFieldMetadataOptionMaps: { byUniversalIdentifier: {} },
    flatViewMaps: {
      byUniversalIdentifier: Object.fromEntries(
        existingViewUniversalIdentifiers.map((uid) => [uid, { id: 'v' }]),
      ),
      universalIdentifierById: {},
    },
    flatViewGroupMaps: {},
    flatViewFieldMaps: {},
    flatViewFilterMaps: {},
    flatViewSortMaps: {},
    flatViewFieldGroupMaps: {},
    flatViewFilterGroupMaps: {},
  };
};

describe('WschatBridgeStarterViewsService.createIfMissing', () => {
  const workspaceCacheService = { getOrRecompute: jest.fn() };
  const applicationService = {
    findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest.fn(
      async () => ({
        workspaceCustomFlatApplication: { universalIdentifier: 'custom-app' },
      }),
    ),
  };
  const migrationService = {
    validateBuildAndRunWorkspaceMigration: jest.fn(async () => ({
      status: 'success',
    })),
  };
  const service = new WschatBridgeStarterViewsService(
    workspaceCacheService as never,
    applicationService as never,
    migrationService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fromCreateViewInputToFlatViewToCreate).mockReturnValue({
      flatViewToCreate: { id: 'new-view', universalIdentifier: 'new-uid' },
      flatViewGroupsToCreate: [
        { fieldValue: 'T_1', isVisible: true },
        { fieldValue: 'NOT_SET', isVisible: true },
        { fieldValue: '', isVisible: true },
      ],
    } as never);
    jest
      .mocked(buildCompleteViewChildrenFlatOperations)
      .mockReturnValue({ viewField: 'fields' } as never);
  });

  it('should skip a view that already exists', async () => {
    workspaceCacheService.getOrRecompute.mockResolvedValue(
      buildMaps([TASK_BY_TYPE.universalIdentifier]),
    );

    await expect(
      service.createIfMissing({
        workspaceId: WORKSPACE_ID,
        definition: TASK_BY_TYPE,
        locale: 'ru',
      }),
    ).resolves.toBe(false);
    expect(
      migrationService.validateBuildAndRunWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });

  it('should create the board with our identifier, position, name and a hidden placeholder column', async () => {
    workspaceCacheService.getOrRecompute.mockResolvedValue(buildMaps());

    await expect(
      service.createIfMissing({
        workspaceId: WORKSPACE_ID,
        definition: TASK_BY_TYPE,
        locale: 'ru',
      }),
    ).resolves.toBe(true);

    expect(
      jest.mocked(fromCreateViewInputToFlatViewToCreate).mock.calls[0][0]
        .createViewInput,
    ).toEqual(
      expect.objectContaining({
        universalIdentifier: TASK_BY_TYPE.universalIdentifier,
        name: 'По типу',
        position: -1,
        mainGroupByFieldMetadataId: 'field-wschatType',
      }),
    );

    const [{ allFlatEntityOperationByMetadataName }] = migrationService
      .validateBuildAndRunWorkspaceMigration.mock.calls[0] as unknown as [
      {
        allFlatEntityOperationByMetadataName: {
          viewGroup: { flatEntityToCreate: unknown[] };
          viewField: unknown;
        };
      },
    ];

    expect(
      allFlatEntityOperationByMetadataName.viewGroup.flatEntityToCreate,
    ).toEqual([
      { fieldValue: 'T_1', isVisible: true },
      { fieldValue: 'NOT_SET', isVisible: false },
      { fieldValue: '', isVisible: true },
    ]);
    expect(allFlatEntityOperationByMetadataName.viewField).toBe('fields');
  });

  it('should store the filter as a JSON list and sort fresh first', async () => {
    workspaceCacheService.getOrRecompute.mockResolvedValue(buildMaps());

    await service.createIfMissing({
      workspaceId: WORKSPACE_ID,
      definition: OPEN_CONVERSATIONS,
      locale: 'en',
    });

    const children = jest.mocked(buildCompleteViewChildrenFlatOperations).mock
      .calls[0][0];

    expect(children.fields?.[0]?.fieldMetadataId).toBe('field-name');
    expect(children.filters).toEqual([
      { fieldMetadataId: 'field-state', operand: 'IS', value: '["OPEN"]' },
    ]);
    expect(children.sorts).toEqual([
      { fieldMetadataId: 'field-lastMessageAt', direction: 'DESC' },
    ]);
    expect(
      jest.mocked(fromCreateViewInputToFlatViewToCreate).mock.calls[0][0]
        .createViewInput.name,
    ).toBe('Open');
  });

  it('should refuse when a field is missing, so nothing half-made is written', async () => {
    const maps = buildMaps();

    delete maps.flatFieldMetadataMaps.byUniversalIdentifier['uid-wschatType'];
    workspaceCacheService.getOrRecompute.mockResolvedValue(maps);

    await expect(
      service.createIfMissing({
        workspaceId: WORKSPACE_ID,
        definition: TASK_BY_TYPE,
        locale: 'ru',
      }),
    ).rejects.toThrow('task.byType: field wschatType not found');
    expect(
      migrationService.validateBuildAndRunWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });
});
