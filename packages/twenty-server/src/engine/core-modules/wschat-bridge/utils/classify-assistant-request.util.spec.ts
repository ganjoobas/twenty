import { classifyAssistantRequest } from 'src/engine/core-modules/wschat-bridge/utils/classify-assistant-request.util';

describe('classifyAssistantRequest', () => {
  it('should leave every other path alone', () => {
    for (const path of ['/graphql', '/rest/people', '/metadata', '/mcpx']) {
      expect(classifyAssistantRequest({ path, body: {} })).toBeNull();
    }
  });

  it('should check MCP whatever the case or trailing path', () => {
    for (const path of ['/mcp', '/MCP', '/mcp/', '/mcp/anything']) {
      expect(classifyAssistantRequest({ path, body: {} })).toEqual({
        kind: 'mcp',
      });
    }
  });

  it('should check only the host for discovery documents', () => {
    for (const path of [
      '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/mcp/server-card.json',
      '/.well-known/api-catalog',
    ]) {
      expect(classifyAssistantRequest({ path, body: undefined })).toEqual({
        kind: 'host',
      });
    }
  });

  it('should always close the client credentials grant', () => {
    expect(
      classifyAssistantRequest({
        path: '/oauth/token',
        body: { grant_type: 'client_credentials', client_id: 'x' },
      }),
    ).toEqual({ kind: 'closed' });
  });

  it('should read the code and every token from the body on any oauth path', () => {
    for (const path of ['/oauth/token', '/OAuth/Token/', '/oauth/revoke']) {
      expect(
        classifyAssistantRequest({
          path,
          body: {
            grant_type: 'authorization_code',
            code: 'the-code',
            refresh_token: 'refresh-jwt',
            token: 'other-jwt',
          },
        }),
      ).toEqual({
        kind: 'oauth',
        authorizationCode: 'the-code',
        jwts: ['refresh-jwt', 'other-jwt'],
      });
    }
  });

  it('should ignore credentials that are not strings', () => {
    expect(
      classifyAssistantRequest({
        path: '/oauth/register',
        body: { code: ['a', 'b'], token: 42 },
      }),
    ).toEqual({ kind: 'oauth', authorizationCode: undefined, jwts: [] });
  });
});
