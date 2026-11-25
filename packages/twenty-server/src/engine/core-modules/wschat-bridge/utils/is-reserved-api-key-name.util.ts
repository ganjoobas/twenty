import { WSCHAT_BRIDGE_SERVICE_KEY_NAME } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-api-keys.constant';

export const isReservedApiKeyName = (name: string): boolean =>
  name.trim().toLowerCase() === WSCHAT_BRIDGE_SERVICE_KEY_NAME.toLowerCase();
