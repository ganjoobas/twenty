import { isNonEmptyString } from '@sniptt/guards';
import { getUrlSafely } from 'twenty-shared/utils';

const WSCHAT_ENTER_PATH = '/workspace/crm/enter';

// Agreed with WSChat: only an assistant's consent page comes back, as a relative path of at most 2048 characters
const RETURN_PATH_PREFIX = '/authorize?';
const RETURN_PATH_MAX_LENGTH = 2048;

// Framed: WSChat itself (the embedding page) issues a new login link into the frame.
// Standalone tab: FRONTEND_URL, which in WSChat's setup is WSChat's own address; see WSCHAT.md
export const buildWschatEnterUrl = ({
  embeddingHostOrigin,
  frontOrigin,
  returnToPath,
}: {
  embeddingHostOrigin: string | undefined;
  frontOrigin: string | undefined;
  returnToPath: string | null | undefined;
}): string | undefined => {
  if (isNonEmptyString(embeddingHostOrigin)) {
    const url = new URL(WSCHAT_ENTER_PATH, embeddingHostOrigin);

    url.searchParams.set('frame', '1');

    return url.toString();
  }

  const origin = getUrlSafely(frontOrigin ?? '')?.origin;

  if (!isNonEmptyString(origin) || origin === 'null') {
    return undefined;
  }

  const url = new URL(WSCHAT_ENTER_PATH, origin);

  if (
    isNonEmptyString(returnToPath) &&
    returnToPath.startsWith(RETURN_PATH_PREFIX) &&
    returnToPath.length <= RETURN_PATH_MAX_LENGTH
  ) {
    url.searchParams.set('return', returnToPath);
  }

  return url.toString();
};
