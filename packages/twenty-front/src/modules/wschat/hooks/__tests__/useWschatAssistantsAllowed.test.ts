import { renderHook, waitFor } from '@testing-library/react';

import { useWschatAssistantsAllowed } from '@/wschat/hooks/useWschatAssistantsAllowed';

describe('useWschatAssistantsAllowed', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockFetch = (implementation: (url: unknown) => Promise<unknown>) => {
    const fetchMock = jest.fn(implementation);

    global.fetch = fetchMock as unknown as typeof fetch;

    return fetchMock;
  };

  it('should be allowed when the discovery document answers', async () => {
    const fetchMock = mockFetch(async () => ({ ok: true }));

    const { result } = renderHook(() => useWschatAssistantsAllowed());

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(true));
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /\/\.well-known\/oauth-protected-resource\/mcp$/,
    );
  });

  it('should not be allowed when the server answers 404', async () => {
    mockFetch(async () => ({ ok: false }));

    const { result } = renderHook(() => useWschatAssistantsAllowed());

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('should not be allowed when the request fails', async () => {
    mockFetch(async () => {
      throw new Error('offline');
    });

    const { result } = renderHook(() => useWschatAssistantsAllowed());

    await waitFor(() => expect(result.current).toBe(false));
  });
});
