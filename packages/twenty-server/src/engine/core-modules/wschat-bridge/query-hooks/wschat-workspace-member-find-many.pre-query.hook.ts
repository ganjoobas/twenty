import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type FindManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { excludeWschatServiceMemberFromFilter } from 'src/engine/core-modules/wschat-bridge/utils/exclude-wschat-service-member.util';

// People only: WSChat reads the full list with the service key to map emails to members
@WorkspaceQueryHook(`workspaceMember.findMany`)
export class WschatWorkspaceMemberFindManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: FindManyResolverArgs,
  ): Promise<FindManyResolverArgs> {
    if (!isUserAuthContext(authContext)) {
      return payload;
    }

    return {
      ...payload,
      filter: excludeWschatServiceMemberFromFilter(
        objectName,
        payload.filter ?? {},
        this.twentyConfigService.get('WSCHAT_BRIDGE_SERVICE_USER_EMAIL'),
      ),
    };
  }
}
