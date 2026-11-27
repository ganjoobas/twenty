import { useEffect, useState } from 'react';

import { returnToPathState } from '@/auth/states/returnToPathState';
import { domainConfigurationState } from '@/domain-manager/states/domainConfigurationState';
import { getEmbeddingHostOrigin } from '@/ui/field/display/utils/postLinkToEmbeddingHost';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { WSCHAT_HIDDEN_FEATURES } from '@/wschat/constants/WschatHiddenFeatures';
import { buildWschatEnterUrl } from '@/wschat/utils/buildWschatEnterUrl';
import { claimWschatEnterAttempt } from '@/wschat/utils/claimWschatEnterAttempt';

const readSessionStorage = (): Storage | undefined => {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
};

// true while the workspace sign-in screen, which has no way in here, is being replaced by WSChat's entry
export const useWschatEnterThroughHost = (
  isOnEmptySignIn: boolean,
): boolean => {
  const domainConfiguration = useAtomStateValue(domainConfigurationState);
  const returnToPath = useAtomStateValue(returnToPathState);
  const [hasStayed, setHasStayed] = useState(false);
  const isEnabled = WSCHAT_HIDDEN_FEATURES.signInScreen && isOnEmptySignIn;

  // Leaving the app is not a state update, so there is no event handler to put it in
  useEffect(() => {
    if (!isEnabled || hasStayed) {
      return;
    }

    const enterUrl = buildWschatEnterUrl({
      embeddingHostOrigin: getEmbeddingHostOrigin(window),
      frontOrigin: `${window.location.protocol}//${domainConfiguration.frontDomain}`,
      returnToPath,
    });

    if (
      enterUrl === undefined ||
      !claimWschatEnterAttempt({
        storage: readSessionStorage(),
        now: Date.now(),
      })
    ) {
      setHasStayed(true);

      return;
    }

    // In a frame this reloads the frame only; the embedding page is left alone
    window.location.replace(enterUrl);
  }, [isEnabled, hasStayed, domainConfiguration.frontDomain, returnToPath]);

  return isEnabled && !hasStayed;
};
