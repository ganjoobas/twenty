import { WSCHAT_BRIDGE_FIELD_ICONS } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-starter-layout.constant';
import { WschatBridgeFieldIconsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-field-icons.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const [SHOW_IN_WSCHAT] = WSCHAT_BRIDGE_FIELD_ICONS;

describe('WschatBridgeFieldIconsService', () => {
  const fieldMetadataService = { updateOneField: jest.fn(async () => ({})) };

  const serviceWithIcon = (icon: string | undefined) =>
    new WschatBridgeFieldIconsService(
      {
        getOrRecompute: jest.fn(async () => ({
          flatFieldMetadataMaps: {
            byUniversalIdentifier:
              icon === undefined
                ? {}
                : {
                    [SHOW_IN_WSCHAT.fieldUniversalIdentifier]: {
                      id: 'show-field',
                      icon,
                    },
                  },
          },
        })),
      } as never,
      fieldMetadataService as never,
    );

  beforeEach(() => jest.clearAllMocks());

  it('gives «Show in WSChat» the WSChat icon while it still has the one it was created with', async () => {
    const result =
      await serviceWithIcon('IconMessageShare').apply(WORKSPACE_ID);

    expect(fieldMetadataService.updateOneField).toHaveBeenCalledWith({
      updateFieldInput: { id: 'show-field', icon: 'IconWschat' },
      workspaceId: WORKSPACE_ID,
      shouldDeferActions: false,
    });
    expect(result).toEqual({ changed: ['task.wschatShow'], skipped: [] });
  });

  it('leaves an icon the company chose, and does nothing when already done or not created yet', async () => {
    expect(await serviceWithIcon('IconStar').apply(WORKSPACE_ID)).toEqual({
      changed: [],
      skipped: ['task.wschatShow'],
    });
    expect(await serviceWithIcon('IconWschat').apply(WORKSPACE_ID)).toEqual({
      changed: [],
      skipped: [],
    });
    expect(await serviceWithIcon(undefined).apply(WORKSPACE_ID)).toEqual({
      changed: [],
      skipped: [],
    });
    expect(fieldMetadataService.updateOneField).not.toHaveBeenCalled();
  });
});
