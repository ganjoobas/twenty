const WSCHAT_ENTER_ATTEMPT_KEY = 'wschat-enter-attempt';

// Long enough for WSChat to issue a link and the browser to come back, short enough not to block a later visit
const WSCHAT_ENTER_ATTEMPT_WINDOW_MS = 2 * 60 * 1000;

type AttemptStorage = Pick<Storage, 'getItem' | 'setItem'>;

// false: we already sent this tab to WSChat moments ago and it came back signed out, so stop there.
// Without storage a loop cannot be ruled out, so nothing is attempted.
export const claimWschatEnterAttempt = ({
  storage,
  now,
}: {
  storage: AttemptStorage | undefined;
  now: number;
}): boolean => {
  try {
    if (storage === undefined) {
      return false;
    }

    const lastAttempt = Number(storage.getItem(WSCHAT_ENTER_ATTEMPT_KEY));

    if (
      Number.isFinite(lastAttempt) &&
      lastAttempt > 0 &&
      now - lastAttempt < WSCHAT_ENTER_ATTEMPT_WINDOW_MS
    ) {
      return false;
    }

    storage.setItem(WSCHAT_ENTER_ATTEMPT_KEY, String(now));

    return true;
  } catch {
    return false;
  }
};
