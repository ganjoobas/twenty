// What the assistants gate must check before a request reaches upstream:
// - closed: refused on every host;
// - host: only that the host's workspace allows assistants;
// - mcp: that, and that any bearer or session belongs to the host's workspace;
// - oauth: that, and that every code or token in the body belongs to it.
export type AssistantRequestCheck =
  | { kind: 'closed' }
  | { kind: 'host' }
  | { kind: 'mcp' }
  | { kind: 'oauth'; authorizationCode?: string; jwts: string[] };

const readString = (body: unknown, key: string): string | undefined => {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const value: unknown = Reflect.get(body, key);

  return typeof value === 'string' ? value : undefined;
};

// Express matches routes case-insensitively and ignores a trailing slash, so
// OAuth credentials are read from the body on any /oauth path, not by endpoint name
export const classifyAssistantRequest = ({
  path,
  body,
}: {
  path: string;
  body: unknown;
}): AssistantRequestCheck | null => {
  const normalizedPath = path.toLowerCase();

  if (normalizedPath === '/mcp' || normalizedPath.startsWith('/mcp/')) {
    return { kind: 'mcp' };
  }

  if (normalizedPath.startsWith('/.well-known/')) {
    return { kind: 'host' };
  }

  if (!normalizedPath.startsWith('/oauth/')) {
    return null;
  }

  // Tokens of confidential apps installed in one workspace; no assistant uses this grant
  if (readString(body, 'grant_type') === 'client_credentials') {
    return { kind: 'closed' };
  }

  const jwts = ['refresh_token', 'token']
    .map((key) => readString(body, key))
    .filter((value): value is string => value !== undefined);

  return {
    kind: 'oauth',
    authorizationCode: readString(body, 'code'),
    jwts,
  };
};
