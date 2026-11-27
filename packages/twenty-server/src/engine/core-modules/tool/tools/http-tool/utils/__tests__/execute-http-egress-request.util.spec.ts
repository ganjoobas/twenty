import { type AxiosInstance } from 'axios';

import { executeHttpEgressRequest } from 'src/engine/core-modules/tool/tools/http-tool/utils/execute-http-egress-request.util';

const buildRequest = (maxRedirects?: number) => ({
  input: { url: 'https://api.example.com/items', method: 'GET' as const },
  limits: { timeoutMs: 1_000, maxPayloadSizeBytes: 1_000, maxRedirects },
  context: { workspaceId: 'workspace-1', source: 'workflow-http' as const },
});

describe('executeHttpEgressRequest', () => {
  const httpClient = jest.fn(async () => ({
    status: 200,
    statusText: 'OK',
    headers: {},
    data: {},
  }));

  beforeEach(() => httpClient.mockClear());

  it('should follow no redirect when the request limits say so', async () => {
    await executeHttpEgressRequest(
      buildRequest(0),
      httpClient as unknown as AxiosInstance,
    );

    expect(httpClient).toHaveBeenCalledWith(
      expect.objectContaining({ maxRedirects: 0 }),
    );
  });

  it("should keep the client's redirect policy otherwise", async () => {
    await executeHttpEgressRequest(
      buildRequest(),
      httpClient as unknown as AxiosInstance,
    );

    expect(httpClient).toHaveBeenCalledWith(
      expect.not.objectContaining({ maxRedirects: expect.anything() }),
    );
  });
});
