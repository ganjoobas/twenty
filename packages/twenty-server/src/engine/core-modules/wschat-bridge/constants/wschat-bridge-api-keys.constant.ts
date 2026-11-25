export const WSCHAT_BRIDGE_MAX_ACTIVE_API_KEYS = 20;

// Twenty's own "Never" choice (front NEVER_EXPIRE_DELTA_IN_YEARS): the expiry column is not nullable
export const WSCHAT_BRIDGE_API_KEY_DEFAULT_LIFETIME_IN_DAYS = 100 * 365;

// Name of WSChat's own key: records it writes show this name as author. Company admins cannot create keys at all,
// and the bridge refuses this name for company keys, so the name alone identifies the service key
export const WSCHAT_BRIDGE_SERVICE_KEY_NAME = 'WSChat';
