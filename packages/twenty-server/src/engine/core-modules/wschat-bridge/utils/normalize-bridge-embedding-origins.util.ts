import { MAX_ALLOWED_IFRAME_ORIGINS } from 'twenty-shared/constants';
import { isDefined, normalizeIframeOrigin } from 'twenty-shared/utils';

export type WschatBridgeEmbeddingOriginsResult =
  | { kind: 'valid'; origins: string[] }
  | { kind: 'invalid'; origin: string }
  | { kind: 'tooMany'; count: number };

// Validated up front with the same normaliser and cap as updateWorkspaceAllowedEmbeddingOrigins, so the
// per-origin upstream calls that follow cannot fail half-way on input
export const normalizeBridgeEmbeddingOrigins = (
  origins: string[],
): WschatBridgeEmbeddingOriginsResult => {
  const normalizedOrigins: string[] = [];

  for (const origin of origins) {
    const normalizedOrigin = normalizeIframeOrigin(origin);

    if (!isDefined(normalizedOrigin)) {
      return { kind: 'invalid', origin };
    }

    normalizedOrigins.push(normalizedOrigin);
  }

  const uniqueOrigins = [...new Set(normalizedOrigins)];

  if (uniqueOrigins.length > MAX_ALLOWED_IFRAME_ORIGINS) {
    return { kind: 'tooMany', count: uniqueOrigins.length };
  }

  return { kind: 'valid', origins: uniqueOrigins };
};
