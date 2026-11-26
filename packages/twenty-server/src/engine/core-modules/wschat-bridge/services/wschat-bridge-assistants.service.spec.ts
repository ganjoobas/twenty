import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
import { KeyValuePairType } from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { WschatBridgeAssistantsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-assistants.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

const FLAG_ROW = {
  type: KeyValuePairType.CONFIG_VARIABLE,
  userId: null,
  key: 'WSCHAT_ASSISTANTS_ENABLED',
  workspaceId: WORKSPACE_ID,
};

describe('WschatBridgeAssistantsService', () => {
  let storedValue: boolean | undefined;

  const keyValuePairService = {
    get: jest.fn(async () =>
      storedValue === undefined ? [] : [{ value: storedValue }],
    ),
    set: jest.fn(async ({ value }: { value: boolean }) => {
      storedValue = value;
    }),
    delete: jest.fn(async () => {
      storedValue = undefined;
    }),
  };
  const applicationAuthorizationService = {
    findActiveAuthorizationsForWorkspace: jest.fn(async () => [
      {
        id: 'assistant',
        application: {
          sourceType: ApplicationRegistrationSourceType.OAUTH_ONLY,
        },
      },
      {
        id: 'installed-app',
        application: { sourceType: ApplicationRegistrationSourceType.NPM },
      },
    ]),
    revokeAuthorizationByIdForWorkspace: jest.fn(async () => true),
  };

  const service = new WschatBridgeAssistantsService(
    keyValuePairService as never,
    applicationAuthorizationService as never,
  );

  beforeEach(() => {
    storedValue = undefined;
    jest.clearAllMocks();
  });

  it('should be off for a workspace that was never switched on', async () => {
    expect(await service.isEnabled(WORKSPACE_ID)).toBe(false);
    expect(keyValuePairService.get).toHaveBeenCalledWith(FLAG_ROW);
  });

  it('should switch on in the workspace row and revoke nothing', async () => {
    expect(await service.apply(WORKSPACE_ID, true)).toEqual({
      assistantsEnabled: true,
      assistantAuthorizationsRevoked: 0,
    });
    expect(keyValuePairService.set).toHaveBeenCalledWith({
      ...FLAG_ROW,
      value: true,
    });
    expect(await service.isEnabled(WORKSPACE_ID)).toBe(true);
    expect(
      applicationAuthorizationService.revokeAuthorizationByIdForWorkspace,
    ).not.toHaveBeenCalled();
  });

  it('should switch off and revoke only assistant grants of this workspace', async () => {
    storedValue = true;

    expect(await service.apply(WORKSPACE_ID, false)).toEqual({
      assistantsEnabled: false,
      assistantAuthorizationsRevoked: 1,
    });
    expect(keyValuePairService.delete).toHaveBeenCalledWith(FLAG_ROW);
    expect(
      applicationAuthorizationService.findActiveAuthorizationsForWorkspace,
    ).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID });
    expect(
      applicationAuthorizationService.revokeAuthorizationByIdForWorkspace,
    ).toHaveBeenCalledTimes(1);
    expect(
      applicationAuthorizationService.revokeAuthorizationByIdForWorkspace,
    ).toHaveBeenCalledWith({
      authorizationId: 'assistant',
      workspaceId: WORKSPACE_ID,
    });
  });

  it('should keep the state when not told and still revoke while off', async () => {
    expect(await service.apply(WORKSPACE_ID, undefined)).toEqual({
      assistantsEnabled: false,
      assistantAuthorizationsRevoked: 1,
    });
    expect(keyValuePairService.set).not.toHaveBeenCalled();
    expect(keyValuePairService.delete).not.toHaveBeenCalled();

    storedValue = true;

    expect(await service.apply(WORKSPACE_ID, undefined)).toEqual({
      assistantsEnabled: true,
      assistantAuthorizationsRevoked: 0,
    });
  });
});
