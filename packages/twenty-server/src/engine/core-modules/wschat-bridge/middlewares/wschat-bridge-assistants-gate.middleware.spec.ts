import { NotFoundException } from '@nestjs/common';

import { createHash } from 'crypto';

import { type Request, type Response } from 'express';
import * as jwt from 'jsonwebtoken';

import { WschatBridgeAssistantsGateMiddleware } from 'src/engine/core-modules/wschat-bridge/middlewares/wschat-bridge-assistants-gate.middleware';

const ALLOWED_WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const BLOCKED_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

const HOSTS: Record<string, string> = {
  'allowed.wschat.org': ALLOWED_WORKSPACE_ID,
  'blocked.wschat.org': BLOCKED_WORKSPACE_ID,
};

const jwtFor = (workspaceId: string) =>
  jwt.sign({ workspaceId, sub: 'x' }, 'any-secret');

const hashOf = (code: string) =>
  createHash('sha256').update(code).digest('hex');

const CODES: Record<string, string> = {
  [hashOf('allowed-code')]: ALLOWED_WORKSPACE_ID,
  [hashOf('blocked-code')]: BLOCKED_WORKSPACE_ID,
};

const buildRequest = ({
  host,
  url,
  method = 'POST',
  body = {},
  headers = {},
}: {
  host: string;
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}) =>
  ({
    protocol: 'https',
    method,
    originalUrl: url,
    body,
    headers,
    get: (name: string) => (name.toLowerCase() === 'host' ? host : undefined),
  }) as unknown as Request;

describe('WschatBridgeAssistantsGateMiddleware', () => {
  const appTokenRepository = {
    findOne: jest.fn(async ({ where }: { where: { value: string } }) =>
      CODES[where.value] === undefined
        ? null
        : { workspaceId: CODES[where.value] },
    ),
  };
  const workspaceDomainsService = {
    getWorkspaceByOriginOrDefaultWorkspace: jest.fn(async (origin: string) => {
      const workspaceId = HOSTS[new URL(origin).host];

      return workspaceId === undefined ? undefined : { id: workspaceId };
    }),
  };
  const assistantsService = {
    isEnabled: jest.fn(
      async (workspaceId: string) => workspaceId === ALLOWED_WORKSPACE_ID,
    ),
  };

  const middleware = new WschatBridgeAssistantsGateMiddleware(
    appTokenRepository as never,
    workspaceDomainsService as never,
    assistantsService as never,
  );

  const run = async (request: Request) => {
    const next = jest.fn();

    await middleware.use(request, {} as Response, next);

    return next;
  };

  const expectClosed = async (request: Request) => {
    await expect(run(request)).rejects.toThrow(NotFoundException);
  };

  const expectOpen = async (request: Request) => {
    expect(await run(request)).toHaveBeenCalledTimes(1);
  };

  it('should let non-assistant paths through on any host', async () => {
    await expectOpen(
      buildRequest({ host: 'crm.wschat.org', url: '/graphql', method: 'POST' }),
    );
  });

  it('should close every entry on the service host and on unknown hosts', async () => {
    for (const host of ['crm.wschat.org', 'unknown.wschat.org']) {
      await expectClosed(buildRequest({ host, url: '/mcp' }));
      await expectClosed(buildRequest({ host, url: '/oauth/register' }));
      await expectClosed(
        buildRequest({
          host,
          url: '/.well-known/oauth-authorization-server',
          method: 'GET',
        }),
      );
    }
  });

  it('should close every entry of a workspace without assistants', async () => {
    const host = 'blocked.wschat.org';

    await expectClosed(buildRequest({ host, url: '/mcp' }));
    await expectClosed(
      buildRequest({
        host,
        url: '/mcp',
        headers: { authorization: `Bearer ${jwtFor(BLOCKED_WORKSPACE_ID)}` },
      }),
    );
    await expectClosed(buildRequest({ host, url: '/oauth/register' }));
    await expectClosed(
      buildRequest({
        host,
        url: '/.well-known/oauth-protected-resource/mcp?x=1',
        method: 'GET',
      }),
    );
    await expectClosed(
      buildRequest({
        host,
        url: '/oauth/token',
        body: {
          grant_type: 'refresh_token',
          refresh_token: jwtFor(BLOCKED_WORKSPACE_ID),
        },
      }),
    );
  });

  it('should open discovery, registration and anonymous MCP on an allowed host', async () => {
    const host = 'allowed.wschat.org';

    await expectOpen(buildRequest({ host, url: '/mcp' }));
    await expectOpen(buildRequest({ host, url: '/oauth/register' }));
    await expectOpen(
      buildRequest({
        host,
        url: '/.well-known/oauth-authorization-server',
        method: 'GET',
      }),
    );
  });

  it('should accept credentials of the host workspace only', async () => {
    const host = 'allowed.wschat.org';

    await expectOpen(
      buildRequest({
        host,
        url: '/mcp',
        headers: { authorization: `Bearer ${jwtFor(ALLOWED_WORKSPACE_ID)}` },
      }),
    );
    await expectOpen(
      buildRequest({
        host,
        url: '/oauth/token',
        body: { grant_type: 'authorization_code', code: 'allowed-code' },
      }),
    );
    await expectOpen(
      buildRequest({
        host,
        url: '/oauth/introspect',
        body: { token: jwtFor(ALLOWED_WORKSPACE_ID) },
      }),
    );
  });

  it('should refuse, on an allowed host, credentials of another workspace', async () => {
    const host = 'allowed.wschat.org';

    await expectClosed(
      buildRequest({
        host,
        url: '/mcp',
        headers: { authorization: `Bearer ${jwtFor(BLOCKED_WORKSPACE_ID)}` },
      }),
    );
    await expectClosed(
      buildRequest({
        host,
        url: '/OAuth/Token/',
        body: { grant_type: 'authorization_code', code: 'blocked-code' },
      }),
    );
    await expectClosed(
      buildRequest({
        host,
        url: '/oauth/token',
        body: {
          grant_type: 'refresh_token',
          refresh_token: jwtFor(BLOCKED_WORKSPACE_ID),
        },
      }),
    );
    await expectClosed(
      buildRequest({
        host,
        url: '/oauth/revoke',
        body: { token: jwtFor(BLOCKED_WORKSPACE_ID) },
      }),
    );
  });

  it('should refuse unreadable credentials and unknown codes', async () => {
    const host = 'allowed.wschat.org';

    for (const authorization of ['Bearer not-a-jwt', 'Basic abc', 'Bearer']) {
      await expectClosed(
        buildRequest({ host, url: '/mcp', headers: { authorization } }),
      );
    }
    await expectClosed(
      buildRequest({
        host,
        url: '/oauth/token',
        body: { grant_type: 'authorization_code', code: 'unknown-code' },
      }),
    );
  });

  it('should refuse MCP over a session cookie', async () => {
    await expectClosed(
      buildRequest({
        host: 'allowed.wschat.org',
        url: '/mcp',
        headers: { cookie: 'twenty-session=sess_abc.def' },
      }),
    );
  });

  it('should close the client credentials grant even on an allowed host', async () => {
    await expectClosed(
      buildRequest({
        host: 'allowed.wschat.org',
        url: '/oauth/token',
        body: { grant_type: 'client_credentials' },
      }),
    );
  });
});
