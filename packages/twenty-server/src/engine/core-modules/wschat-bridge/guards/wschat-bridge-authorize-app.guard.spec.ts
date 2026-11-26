import { type ExecutionContext, NotFoundException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { WschatBridgeAuthorizeAppGuard } from 'src/engine/core-modules/wschat-bridge/guards/wschat-bridge-authorize-app.guard';

const ALLOWED_WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const BLOCKED_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

const buildGraphqlContext = ({
  fieldName,
  parentTypeName = 'Mutation',
  workspaceId,
}: {
  fieldName: string;
  parentTypeName?: string;
  workspaceId?: string;
}) => {
  jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
    getInfo: () => ({ fieldName, parentType: { name: parentTypeName } }),
    getContext: () => ({
      req: { workspace: workspaceId ? { id: workspaceId } : undefined },
    }),
  } as unknown as GqlExecutionContext);

  return { getType: () => 'graphql' } as unknown as ExecutionContext;
};

describe('WschatBridgeAuthorizeAppGuard', () => {
  const assistantsService = {
    isEnabled: jest.fn(
      async (workspaceId: string) => workspaceId === ALLOWED_WORKSPACE_ID,
    ),
  };
  const guard = new WschatBridgeAuthorizeAppGuard(assistantsService as never);

  afterEach(() => jest.restoreAllMocks());

  it('should not look at HTTP requests', async () => {
    const context = { getType: () => 'http' } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('should not look at other operations', async () => {
    await expect(
      guard.canActivate(
        buildGraphqlContext({
          fieldName: 'renewToken',
          workspaceId: BLOCKED_WORKSPACE_ID,
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        buildGraphqlContext({
          fieldName: 'authorizeApp',
          parentTypeName: 'Query',
          workspaceId: BLOCKED_WORKSPACE_ID,
        }),
      ),
    ).resolves.toBe(true);
  });

  it('should allow consent in a workspace with assistants', async () => {
    await expect(
      guard.canActivate(
        buildGraphqlContext({
          fieldName: 'authorizeApp',
          workspaceId: ALLOWED_WORKSPACE_ID,
        }),
      ),
    ).resolves.toBe(true);
  });

  it('should refuse consent in a workspace without assistants or without a workspace', async () => {
    for (const workspaceId of [BLOCKED_WORKSPACE_ID, undefined]) {
      await expect(
        guard.canActivate(
          buildGraphqlContext({ fieldName: 'authorizeApp', workspaceId }),
        ),
      ).rejects.toThrow(NotFoundException);
    }
  });
});
