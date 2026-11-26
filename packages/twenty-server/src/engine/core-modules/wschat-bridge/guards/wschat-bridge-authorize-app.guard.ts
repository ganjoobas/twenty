import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type GqlContextType, GqlExecutionContext } from '@nestjs/graphql';

import { isNonEmptyString } from '@sniptt/guards';

import { WschatBridgeAssistantsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-assistants.service';

const AUTHORIZE_APP_MUTATION = 'authorizeApp';

// Global guard: the consent mutation issues a code only in a workspace that allows assistants
@Injectable()
export class WschatBridgeAuthorizeAppGuard implements CanActivate {
  constructor(
    private readonly assistantsService: WschatBridgeAssistantsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<GqlContextType>() !== 'graphql') {
      return true;
    }

    const graphqlContext = GqlExecutionContext.create(context);
    const info = graphqlContext.getInfo<{
      fieldName?: string;
      parentType?: { name?: string };
    }>();

    if (
      info?.fieldName !== AUTHORIZE_APP_MUTATION ||
      info.parentType?.name !== 'Mutation'
    ) {
      return true;
    }

    // The code is bound to the session's workspace (generateAuthorizationCode), so that one decides
    const workspaceId: unknown = graphqlContext.getContext<{
      req?: { workspace?: { id?: unknown } };
    }>().req?.workspace?.id;

    if (
      isNonEmptyString(workspaceId) &&
      (await this.assistantsService.isEnabled(workspaceId))
    ) {
      return true;
    }

    throw new NotFoundException('Not found');
  }
}
