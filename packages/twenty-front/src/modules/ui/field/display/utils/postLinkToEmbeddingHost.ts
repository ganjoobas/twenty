import { isNonEmptyString } from '@sniptt/guards';
import { getUrlSafely, isDefined } from 'twenty-shared/utils';

export type EmbeddingHostWindow = {
  self: unknown;
  top: unknown;
  location: { origin: string; ancestorOrigins?: ArrayLike<string> };
  document: { referrer: string };
  parent: { postMessage: (message: unknown, targetOrigin: string) => void };
};

type PostLinkToEmbeddingHostArgs = {
  url: string;
  currentWindow?: EmbeddingHostWindow;
};

// frame-ancestors only lets 'self' and the workspace's allowed embedding origins frame the app, so the parent is trusted.
// Firefox has no ancestorOrigins, hence the referrer fallback.
export const getEmbeddingHostOrigin = (
  currentWindow: Pick<
    EmbeddingHostWindow,
    'self' | 'top' | 'location' | 'document'
  >,
) => {
  if (currentWindow.self === currentWindow.top) {
    return undefined;
  }

  const parentOrigin = getUrlSafely(
    currentWindow.location.ancestorOrigins?.[0] ??
      currentWindow.document.referrer,
  )?.origin;

  if (
    !isNonEmptyString(parentOrigin) ||
    parentOrigin === 'null' ||
    parentOrigin === currentWindow.location.origin
  ) {
    return undefined;
  }

  return parentOrigin;
};

// Hands a link to the page embedding the app (WSChat opens it beside the CRM) instead of a new tab; see WSCHAT.md
export const postLinkToEmbeddingHost = ({
  url,
  currentWindow = window,
}: PostLinkToEmbeddingHostArgs): boolean => {
  const embeddingHostOrigin = getEmbeddingHostOrigin(currentWindow);

  if (
    !isDefined(embeddingHostOrigin) ||
    getUrlSafely(url)?.origin !== embeddingHostOrigin
  ) {
    return false;
  }

  currentWindow.parent.postMessage(
    { type: 'wschat:open-link', url },
    embeddingHostOrigin,
  );

  return true;
};
