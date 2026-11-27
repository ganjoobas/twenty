import { authorizeWschatActionsRequest } from 'src/engine/core-modules/wschat-bridge/utils/authorize-wschat-actions-request.util';

const TARGET = { url: 'https://wschat.org/crm-actions/v1', token: 'tok_1' };

const authorize = (url: string, headers?: Record<string, string>) =>
  authorizeWschatActionsRequest({
    input: { url, method: 'POST', headers },
    target: TARGET,
  })?.headers;

describe('authorizeWschatActionsRequest', () => {
  it('should add the token to calls of the stored endpoint and below it', () => {
    for (const url of [
      'https://wschat.org/crm-actions/v1',
      'https://wschat.org/crm-actions/v1/messages',
      'https://WSCHAT.org:443/crm-actions/v1/tasks?x=1',
    ]) {
      expect(authorize(url, { 'Content-Type': 'application/json' })).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok_1',
      });
    }
  });

  it('should replace whatever Authorization the step carries with the stored token', () => {
    expect(
      authorize('https://wschat.org/crm-actions/v1/messages', {
        authorization: 'Bearer copied-from-another-workspace',
      }),
    ).toEqual({ Authorization: 'Bearer tok_1' });
  });

  it('should never add it to a look-alike host, path, scheme or port', () => {
    for (const url of [
      'https://wschat.org.evil.com/crm-actions/v1/messages',
      'https://evil.com/wschat.org/crm-actions/v1/messages',
      'https://wschat.org@evil.com/crm-actions/v1/messages',
      'https://wschat.org/crm-actions/v1evil/messages',
      'https://wschat.org/crm-actions/v1/../../other',
      'https://wschat.org/crm-actions',
      'http://wschat.org/crm-actions/v1/messages',
      'https://wschat.org:8443/crm-actions/v1/messages',
      'https://api.wschat.org/crm-actions/v1/messages',
      'not a url',
    ]) {
      expect(authorize(url)).toBeUndefined();
    }
  });

  it('should leave the request alone when no target is stored', () => {
    expect(
      authorizeWschatActionsRequest({
        input: { url: 'https://wschat.org/crm-actions/v1/messages' },
        target: undefined,
      }),
    ).toBeUndefined();
  });
});
