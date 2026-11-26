import { useEffect, useState } from 'react';

import { REACT_APP_SERVER_BASE_URL } from '~/config';

// The server answers 404 on every assistant entry, discovery included, unless WSChat allows assistants here
const ASSISTANTS_PROBE_PATH = '/.well-known/oauth-protected-resource/mcp';

// undefined while the probe is in flight
export const useWschatAssistantsAllowed = (): boolean | undefined => {
  const [isAllowed, setIsAllowed] = useState<boolean>();

  // A one-off probe on mount; no event to hang it on
  useEffect(() => {
    const abortController = new AbortController();

    fetch(`${REACT_APP_SERVER_BASE_URL}${ASSISTANTS_PROBE_PATH}`, {
      cache: 'no-store',
      signal: abortController.signal,
    })
      .then((response) => setIsAllowed(response.ok))
      .catch(() => {
        if (!abortController.signal.aborted) {
          setIsAllowed(false);
        }
      });

    return () => abortController.abort();
  }, []);

  return isAllowed;
};
