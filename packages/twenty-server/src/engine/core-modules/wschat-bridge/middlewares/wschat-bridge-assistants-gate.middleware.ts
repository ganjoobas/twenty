import {
  Injectable,
  type NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { createHash } from 'crypto';

import { isNonEmptyString } from '@sniptt/guards';
import { type NextFunction, type Request, type Response } from 'express';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import {
  AppTokenEntity,
  AppTokenType,
} from 'src/engine/core-modules/app-token/app-token.entity';
import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { decodeJwtPayload } from 'src/engine/core-modules/jwt/utils/decode-jwt-payload.util';
import { USER_SESSION_COOKIE_NAME } from 'src/engine/core-modules/user-session/constants/user-session-cookie-name.constant';
import { USER_SESSION_SECURE_COOKIE_NAME } from 'src/engine/core-modules/user-session/constants/user-session-secure-cookie-name.constant';
import { extractUserSessionTokenFromRequestCookie } from 'src/engine/core-modules/user-session/utils/extract-user-session-token-from-request.util';
import { WschatBridgeAssistantsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-assistants.service';
import {
  type AssistantRequestCheck,
  classifyAssistantRequest,
} from 'src/engine/core-modules/wschat-bridge/utils/classify-assistant-request.util';
import { getRequestBaseUrl } from 'src/utils/get-request-base-url.util';

// Deny-only, so payloads are decoded without verification: upstream still verifies everything it lets through
const readWorkspaceIdFromJwt = (token: string): string | undefined => {
  const workspaceId = decodeJwtPayload<{ workspaceId?: unknown }>(
    token,
  )?.workspaceId;

  return isNonEmptyString(workspaceId) ? workspaceId : undefined;
};

const readBearer = (authorizationHeader: string): string | undefined => {
  const [scheme, token, ...rest] = authorizationHeader.trim().split(/\s+/);

  return scheme?.toLowerCase() === 'bearer' && rest.length === 0
    ? token
    : undefined;
};

// Closes MCP, OAuth and discovery (README: "External assistants") unless the
// host's workspace allows assistants and every credential sent belongs to it
@Injectable()
export class WschatBridgeAssistantsGateMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(AppTokenEntity)
    private readonly appTokenRepository: Repository<AppTokenEntity>,
    private readonly workspaceDomainsService: WorkspaceDomainsService,
    private readonly assistantsService: WschatBridgeAssistantsService,
  ) {}

  async use(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> {
    // The mount path is stripped from request.path, never from originalUrl
    const path = request.originalUrl.split('?')[0];
    const check = classifyAssistantRequest({ path, body: request.body });

    if (isDefined(check) && !(await this.isAllowed(request, check))) {
      throw new NotFoundException(`Cannot ${request.method} ${path}`);
    }

    next();
  }

  private async isAllowed(
    request: Request,
    check: AssistantRequestCheck,
  ): Promise<boolean> {
    if (check.kind === 'closed') {
      return false;
    }

    const hostWorkspaceId = await this.findHostWorkspaceId(request);

    if (
      !isDefined(hostWorkspaceId) ||
      !(await this.assistantsService.isEnabled(hostWorkspaceId))
    ) {
      return false;
    }

    const credentialWorkspaceIds = await this.findCredentialWorkspaceIds(
      request,
      check,
    );

    return credentialWorkspaceIds.every(
      (workspaceId) => workspaceId === hostWorkspaceId,
    );
  }

  // The service host (DEFAULT_SUBDOMAIN) and unknown hosts resolve to no workspace
  private async findHostWorkspaceId(
    request: Request,
  ): Promise<string | undefined> {
    try {
      const workspace =
        await this.workspaceDomainsService.getWorkspaceByOriginOrDefaultWorkspace(
          getRequestBaseUrl(request),
        );

      return workspace?.id;
    } catch {
      return undefined;
    }
  }

  // undefined entries (unreadable or unknown credentials) never match a workspace
  private async findCredentialWorkspaceIds(
    request: Request,
    check: AssistantRequestCheck,
  ): Promise<(string | undefined)[]> {
    if (check.kind === 'mcp') {
      const authorizationHeader = request.headers.authorization;

      if (isNonEmptyString(authorizationHeader)) {
        const bearer = readBearer(authorizationHeader);

        return [isDefined(bearer) ? readWorkspaceIdFromJwt(bearer) : undefined];
      }

      // A session cookie is opaque here; assistants send bearers, so it is refused
      const sessionToken = extractUserSessionTokenFromRequestCookie(request, {
        secureCookieName: USER_SESSION_SECURE_COOKIE_NAME,
        insecureCookieName: USER_SESSION_COOKIE_NAME,
        allowInsecureCookieName: true,
      });

      // No credentials at all: upstream answers 401 with the discovery header
      return isDefined(sessionToken) ? [undefined] : [];
    }

    if (check.kind !== 'oauth') {
      return [];
    }

    const workspaceIds = check.jwts.map(readWorkspaceIdFromJwt);

    if (isDefined(check.authorizationCode)) {
      workspaceIds.push(
        await this.findAuthorizationCodeWorkspaceId(check.authorizationCode),
      );
    }

    return workspaceIds;
  }

  // Stored as upstream stores it in generateAuthorizationCode: SHA-256 hex of the code
  private async findAuthorizationCodeWorkspaceId(
    authorizationCode: string,
  ): Promise<string | undefined> {
    const appToken = await this.appTokenRepository.findOne({
      where: {
        value: createHash('sha256').update(authorizationCode).digest('hex'),
        type: AppTokenType.AuthorizationCode,
      },
      select: { id: true, workspaceId: true },
    });

    return appToken?.workspaceId ?? undefined;
  }
}
