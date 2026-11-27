import { KeyValuePairType } from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { WschatBridgeActionsTargetService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-actions-target.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const TARGET = { url: 'https://wschat.org/crm-actions/v1', token: 'tok_1' };
const MESSAGES_URL = 'https://wschat.org/crm-actions/v1/messages';

const TARGET_ROW = {
  type: KeyValuePairType.CONFIG_VARIABLE,
  userId: null,
  key: 'WSCHAT_ACTIONS_TARGET',
  workspaceId: WORKSPACE_ID,
};

describe('WschatBridgeActionsTargetService', () => {
  let rows: Map<string, unknown>;

  const keyValuePairService = {
    get: jest.fn(async ({ workspaceId }: { workspaceId: string }) =>
      rows.has(workspaceId) ? [{ value: rows.get(workspaceId) }] : [],
    ),
    set: jest.fn(
      async ({
        workspaceId,
        value,
      }: {
        workspaceId: string;
        value: unknown;
      }) => {
        rows.set(workspaceId, value);
      },
    ),
  };
  const service = new WschatBridgeActionsTargetService(
    keyValuePairService as never,
  );
  const logged = () =>
    JSON.stringify((service['logger'].error as jest.Mock).mock.calls);

  beforeEach(() => {
    rows = new Map();
    jest.clearAllMocks();
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
  });

  it('should store the target in the workspace row', async () => {
    expect(await service.store(WORKSPACE_ID, TARGET)).toBe(true);
    expect(keyValuePairService.set).toHaveBeenCalledWith({
      ...TARGET_ROW,
      value: TARGET,
    });
    expect(await service.find(WORKSPACE_ID)).toEqual(TARGET);
  });

  it('should not rewrite an unchanged target on every sweep, and keep it when none is sent', async () => {
    rows.set(WORKSPACE_ID, TARGET);

    expect(await service.store(WORKSPACE_ID, { ...TARGET })).toBe(true);
    expect(await service.store(WORKSPACE_ID, undefined)).toBe(true);
    expect(keyValuePairService.set).not.toHaveBeenCalled();
    expect(await service.store(OTHER_WORKSPACE_ID, undefined)).toBe(false);
  });

  it('should overwrite a rotated token', async () => {
    rows.set(WORKSPACE_ID, TARGET);

    await service.store(WORKSPACE_ID, { ...TARGET, token: 'tok_2' });

    expect(await service.find(WORKSPACE_ID)).toEqual({
      ...TARGET,
      token: 'tok_2',
    });
  });

  it('should report a failed write without throwing or logging the token', async () => {
    keyValuePairService.set.mockRejectedValueOnce(
      Object.assign(
        new Error(`insert failed with parameters [${TARGET.token}]`),
        {
          name: 'QueryFailedError',
          code: '23505',
        },
      ),
    );

    expect(await service.store(WORKSPACE_ID, TARGET)).toBe(false);
    expect(logged()).toContain('QueryFailedError 23505');
    expect(logged()).not.toContain(TARGET.token);
  });

  it('should treat a malformed row as no target', async () => {
    rows.set(WORKSPACE_ID, { url: TARGET.url });

    expect(await service.find(WORKSPACE_ID)).toBeUndefined();
  });

  it("should authorize a call of the workspace's own endpoint only", async () => {
    rows.set(OTHER_WORKSPACE_ID, TARGET);

    expect(
      await service.authorizeRequest({
        workspaceId: WORKSPACE_ID,
        input: { url: MESSAGES_URL },
      }),
    ).toBeUndefined();

    rows.set(WORKSPACE_ID, { ...TARGET, token: 'tok_own' });

    expect(
      await service.authorizeRequest({
        workspaceId: WORKSPACE_ID,
        input: { url: MESSAGES_URL },
      }),
    ).toEqual({
      url: MESSAGES_URL,
      headers: { Authorization: 'Bearer tok_own' },
    });
  });

  it('should leave the request alone when the lookup fails', async () => {
    keyValuePairService.get.mockRejectedValueOnce(new Error('db down'));

    expect(
      await service.authorizeRequest({
        workspaceId: WORKSPACE_ID,
        input: { url: MESSAGES_URL },
      }),
    ).toBeUndefined();
  });
});
