import { KeyValuePairType } from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { WschatBridgeActionsTargetService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-actions-target.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const TARGET = { url: 'https://wschat.org/crm-actions/v1', token: 'tok_1' };

const TARGET_ROW = {
  type: KeyValuePairType.CONFIG_VARIABLE,
  userId: null,
  key: 'WSCHAT_ACTIONS_TARGET',
  workspaceId: WORKSPACE_ID,
};

describe('WschatBridgeActionsTargetService', () => {
  let storedValue: unknown;

  const keyValuePairService = {
    get: jest.fn(async () =>
      storedValue === undefined ? [] : [{ value: storedValue }],
    ),
    set: jest.fn(async ({ value }: { value: unknown }) => {
      storedValue = value;
    }),
  };
  const service = new WschatBridgeActionsTargetService(
    keyValuePairService as never,
  );

  beforeEach(() => {
    storedValue = undefined;
    jest.clearAllMocks();
  });

  it('should have no target before WSChat brought one', async () => {
    expect(await service.find(WORKSPACE_ID)).toBeUndefined();
    expect(keyValuePairService.get).toHaveBeenCalledWith(TARGET_ROW);
  });

  it('should store the target in the workspace row', async () => {
    await service.store(WORKSPACE_ID, TARGET);

    expect(keyValuePairService.set).toHaveBeenCalledWith({
      ...TARGET_ROW,
      value: TARGET,
    });
    expect(await service.find(WORKSPACE_ID)).toEqual(TARGET);
  });

  it('should not rewrite an unchanged target on every sweep', async () => {
    storedValue = TARGET;

    await service.store(WORKSPACE_ID, { ...TARGET });

    expect(keyValuePairService.set).not.toHaveBeenCalled();
  });

  it('should overwrite a rotated token or a moved endpoint', async () => {
    storedValue = TARGET;

    await service.store(WORKSPACE_ID, { ...TARGET, token: 'tok_2' });
    await service.store(WORKSPACE_ID, {
      url: 'https://wschat.org/crm-actions/v2',
      token: 'tok_2',
    });

    expect(keyValuePairService.set).toHaveBeenCalledTimes(2);
    expect(await service.find(WORKSPACE_ID)).toEqual({
      url: 'https://wschat.org/crm-actions/v2',
      token: 'tok_2',
    });
  });

  it('should treat a malformed row as no target', async () => {
    storedValue = { url: 'https://wschat.org/crm-actions/v1' };

    expect(await service.find(WORKSPACE_ID)).toBeUndefined();
  });
});
