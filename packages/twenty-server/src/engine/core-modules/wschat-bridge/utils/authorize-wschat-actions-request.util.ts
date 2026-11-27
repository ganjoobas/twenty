import { isDefined } from 'twenty-shared/utils';

import { type WschatBridgeActionsTarget } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-actions-target.constant';

const HTTP_PROTOCOLS = ['http:', 'https:'];

// Same origin as the stored endpoint, and its path or below it at a "/" boundary. Parsed, so look-alike hosts
// (wschat.org.evil.com), other ports or schemes, user info and dot segments cannot pass
const isWschatActionsUrl = (url: string, actionsUrl: string): boolean => {
  let request: URL;
  let actions: URL;

  try {
    request = new URL(url);
    actions = new URL(actionsUrl);
  } catch {
    return false;
  }

  const basePath = actions.pathname.replace(/\/+$/, '');

  return (
    HTTP_PROTOCOLS.includes(actions.protocol) &&
    request.origin === actions.origin &&
    (request.pathname === basePath ||
      request.pathname.startsWith(`${basePath}/`))
  );
};

// The request with this workspace's WSChat token when it calls the workspace's own actions endpoint, else undefined.
// The stored token replaces any Authorization the step carries, so a copied or outdated one never reaches WSChat
export const authorizeWschatActionsRequest = <
  TInput extends { url: string; headers?: Record<string, string> },
>({
  input,
  target,
}: {
  input: TInput;
  target: WschatBridgeActionsTarget | undefined;
}): TInput | undefined => {
  if (!isDefined(target) || !isWschatActionsUrl(input.url, target.url)) {
    return undefined;
  }

  return {
    ...input,
    headers: {
      ...Object.fromEntries(
        Object.entries(input.headers ?? {}).filter(
          ([name]) => name.toLowerCase() !== 'authorization',
        ),
      ),
      Authorization: `Bearer ${target.token}`,
    },
  };
};
