import { HttpException } from '@nestjs/common';

import {
  WorkspaceException,
  WorkspaceExceptionCode,
} from 'src/engine/core-modules/workspace/workspace.exception';
import { WschatBridgeWorkspaceDeletionService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-deletion.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const SERVICE_EMAIL = 'crm-service@wschat.org';

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof HttpException
      ? (error.getResponse() as { code: string }).code
      : 'other';
  }

  return 'none';
};

describe('WschatBridgeWorkspaceDeletionService', () => {
  const calls: string[] = [];
  let workspace: { id: string; subdomain: string } | null;
  let serverAdminWorkspaceId: string | undefined;

  const users = [
    {
      id: 'only-here',
      email: 'a@acme.kg',
      canAccessFullAdminPanel: false,
      canImpersonate: false,
      deletedAt: new Date(),
    },
    {
      id: 'elsewhere',
      email: 'b@acme.kg',
      canAccessFullAdminPanel: false,
      canImpersonate: false,
      deletedAt: null,
    },
    {
      id: 'service',
      email: SERVICE_EMAIL,
      canAccessFullAdminPanel: false,
      canImpersonate: false,
      deletedAt: new Date(),
    },
    {
      id: 'owner',
      email: 'owner@wschat.org',
      canAccessFullAdminPanel: true,
      canImpersonate: true,
      deletedAt: null,
    },
  ];

  const workspaceRepository = {
    findOne: jest.fn(async () => workspace),
  };
  const userWorkspaceRepository = {
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      'workspaceId' in where
        ? users.map(({ id }) => ({ userId: id }))
        : [{ userId: 'elsewhere' }],
    ),
  };
  const userRepository = {
    find: jest.fn(async () => users),
    delete: jest.fn(async (id: string) => {
      calls.push(`deleteUser:${id}`);
    }),
    restore: jest.fn(async (id: string) => {
      calls.push(`restoreUser:${id}`);
    }),
  };
  const workspaceService = {
    deleteWorkspace: jest.fn(async () => {
      calls.push('upstreamDelete');
    }),
  };
  const fileService = {
    deleteWorkspaceFolder: jest.fn(async () => {
      calls.push('deleteFolder');
    }),
  };
  const usageService = {
    measureFiles: jest.fn(async () => ({ bytes: 1234, isComplete: true })),
  };
  const serviceUserService = {
    isServiceUserEmail: (email: string) => email === SERVICE_EMAIL,
  };
  const twentyConfigService = { get: jest.fn(() => serverAdminWorkspaceId) };
  const coreEntityCacheService = { invalidate: jest.fn(async () => undefined) };

  const service = new WschatBridgeWorkspaceDeletionService(
    workspaceRepository as never,
    userWorkspaceRepository as never,
    userRepository as never,
    workspaceService as never,
    fileService as never,
    usageService as never,
    serviceUserService as never,
    twentyConfigService as never,
    coreEntityCacheService as never,
  );

  beforeEach(() => {
    calls.length = 0;
    workspace = { id: WORKSPACE_ID, subdomain: 'acme' };
    serverAdminWorkspaceId = undefined;
    jest.clearAllMocks();
  });

  it('should delete files, then the workspace upstream, then users left without a workspace', async () => {
    const result = await service.deleteWorkspace(WORKSPACE_ID, ' ACME ');

    expect(calls).toEqual([
      'deleteFolder',
      'upstreamDelete',
      'deleteUser:only-here',
      'restoreUser:service',
    ]);
    expect(workspaceService.deleteWorkspace).toHaveBeenCalledWith(
      WORKSPACE_ID,
      false,
    );
    expect(result).toEqual({
      deleted: true,
      workspaceId: WORKSPACE_ID,
      filesBytes: 1234,
      usersRemoved: 1,
      usersKept: 3,
      usersLeftSoftDeleted: 0,
    });
  });

  it('should never remove the service user or a server admin', async () => {
    await service.deleteWorkspace(WORKSPACE_ID, 'acme');

    expect(userRepository.delete).not.toHaveBeenCalledWith('service');
    expect(userRepository.delete).not.toHaveBeenCalledWith('owner');
    expect(userRepository.delete).not.toHaveBeenCalledWith('elsewhere');
  });

  it('should refuse a wrong confirmation, the server admin workspace and a missing one, touching nothing', async () => {
    await expect(
      codeOf(service.deleteWorkspace(WORKSPACE_ID, 'other')),
    ).resolves.toBe('CONFIRMATION_MISMATCH');

    serverAdminWorkspaceId = WORKSPACE_ID;
    await expect(
      codeOf(service.deleteWorkspace(WORKSPACE_ID, 'acme')),
    ).resolves.toBe('SYSTEM_WORKSPACE');

    workspace = null;
    await expect(
      codeOf(service.deleteWorkspace(WORKSPACE_ID, 'acme')),
    ).resolves.toBe('WORKSPACE_NOT_FOUND');
    expect(calls).toEqual([]);
  });

  it('should answer WORKSPACE_BUSY while an application is being uninstalled', async () => {
    workspaceService.deleteWorkspace.mockRejectedValueOnce(
      new WorkspaceException(
        'busy',
        WorkspaceExceptionCode.APPLICATION_UNINSTALL_IN_PROGRESS,
      ),
    );

    await expect(
      codeOf(service.deleteWorkspace(WORKSPACE_ID, 'acme')),
    ).resolves.toBe('WORKSPACE_BUSY');
    expect(userRepository.delete).not.toHaveBeenCalled();
  });

  it('should keep a user a foreign key holds soft-deleted and say so', async () => {
    userRepository.delete.mockRejectedValueOnce(new Error('fk'));

    const result = await service.deleteWorkspace(WORKSPACE_ID, 'acme');

    expect(result.usersRemoved).toBe(0);
    expect(result.usersLeftSoftDeleted).toBe(1);
  });
});
