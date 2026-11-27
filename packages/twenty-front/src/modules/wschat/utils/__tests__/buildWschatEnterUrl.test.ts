import { buildWschatEnterUrl } from '@/wschat/utils/buildWschatEnterUrl';
import { claimWschatEnterAttempt } from '@/wschat/utils/claimWschatEnterAttempt';

const CONSENT_PATH =
  '/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&state=x';

describe('buildWschatEnterUrl', () => {
  it('should reload a frame through the embedding page, without a return path', () => {
    expect(
      buildWschatEnterUrl({
        embeddingHostOrigin: 'https://wschat.org',
        frontOrigin: 'https://wschat.org',
        returnToPath: CONSENT_PATH,
      }),
    ).toBe('https://wschat.org/workspace/crm/enter?frame=1');
  });

  it('should send a standalone tab to WSChat with the consent page to come back to', () => {
    const url = new URL(
      buildWschatEnterUrl({
        embeddingHostOrigin: undefined,
        frontOrigin: 'https://wschat.org',
        returnToPath: CONSENT_PATH,
      }) ?? '',
    );

    expect(url.origin + url.pathname).toBe(
      'https://wschat.org/workspace/crm/enter',
    );
    expect(url.searchParams.get('return')).toBe(CONSENT_PATH);
    expect(url.searchParams.has('frame')).toBe(false);
  });

  it('should drop any other return path, and a too long one', () => {
    for (const returnToPath of [
      '/objects/people',
      '/authorize',
      null,
      `/authorize?${'a'.repeat(2048)}`,
    ]) {
      expect(
        buildWschatEnterUrl({
          embeddingHostOrigin: undefined,
          frontOrigin: 'https://wschat.org',
          returnToPath,
        }),
      ).toBe('https://wschat.org/workspace/crm/enter');
    }
  });

  it('should give up without a usable front origin', () => {
    expect(
      buildWschatEnterUrl({
        embeddingHostOrigin: undefined,
        frontOrigin: 'https://',
        returnToPath: CONSENT_PATH,
      }),
    ).toBeUndefined();
  });
});

describe('claimWschatEnterAttempt', () => {
  const buildStorage = () => {
    const values = new Map<string, string>();

    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
  };

  it('should allow one trip to WSChat, not a second one right after', () => {
    const storage = buildStorage();

    expect(claimWschatEnterAttempt({ storage, now: 1_000_000 })).toBe(true);
    expect(claimWschatEnterAttempt({ storage, now: 1_030_000 })).toBe(false);
    expect(claimWschatEnterAttempt({ storage, now: 1_000_000 + 121_000 })).toBe(
      true,
    );
  });

  it('should not go at all when storage is missing or throws', () => {
    expect(claimWschatEnterAttempt({ storage: undefined, now: 1 })).toBe(false);
    expect(
      claimWschatEnterAttempt({
        storage: {
          getItem: () => {
            throw new Error('blocked');
          },
          setItem: () => undefined,
        },
        now: 1,
      }),
    ).toBe(false);
  });
});
