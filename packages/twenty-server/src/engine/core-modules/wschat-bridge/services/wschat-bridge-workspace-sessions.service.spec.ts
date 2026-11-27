import { HttpException } from '@nestjs/common';

import { WschatBridgeWorkspaceSessionsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-sessions.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const SERVICE_EMAIL = 'crm-service@wschat.org';

describe('WschatBridgeWorkspaceSessionsService', () => {
  const sessionsByUser: Record<string, number> = {
    alice: 2,
    bob: 0,
    service: 5,
  };
  const refreshQuery = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn(async () => ({ raw: [{ userId: 'bob' }] })),
  };

  const userWorkspaceRepository = {
    find: jest.fn(async () => [
      { userId: 'alice', user: { email: 'alice@acme.kg' } },
      { userId: 'bob', user: { email: 'bob@acme.kg' } },
      { userId: 'service', user: { email: SERVICE_EMAIL } },
    ]),
  };
  const appTokenRepository = {
    createQueryBuilder: jest.fn(() => refreshQuery),
  };
  const userSessionService = {
    revokeAllSessionsForUser: jest.fn(
      async ({ userId }: { userId: string }) => sessionsByUser[userId] ?? 0,
    ),
  };
  const serviceUserService = {
    isServiceUserEmail: (email: string) => email === SERVICE_EMAIL,
  };
  const workspaceLookupService = {
    findOrThrow: jest.fn(async (id: string) => ({ id })),
  };

  const service = new WschatBridgeWorkspaceSessionsService(
    userWorkspaceRepository as never,
    appTokenRepository as never,
    userSessionService as never,
    serviceUserService as never,
    workspaceLookupService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('should close every member in this workspace only, never the service user', async () => {
    await expect(service.closeAllSessions(WORKSPACE_ID)).resolves.toEqual({
      closedMembers: 2,
      closedSessions: 2,
    });

    expect(userSessionService.revokeAllSessionsForUser).toHaveBeenCalledTimes(
      2,
    );
    for (const userId of ['alice', 'bob']) {
      expect(userSessionService.revokeAllSessionsForUser).toHaveBeenCalledWith({
        userId,
        workspaceId: WORKSPACE_ID,
        reason: 'USER_REVOKED',
      });
    }
    expect(refreshQuery.where).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        type: 'REFRESH_TOKEN',
      }),
    );
  });

  it('should answer 404 for an unknown workspace', async () => {
    workspaceLookupService.findOrThrow.mockRejectedValueOnce(
      new HttpException({ code: 'WORKSPACE_NOT_FOUND' }, 404),
    );

    await expect(service.closeAllSessions(WORKSPACE_ID)).rejects.toThrow(
      HttpException,
    );
    expect(userSessionService.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });
});
