// How long a bridge call keeps retrying a migration refused because the workspace still runs deferred schema
// operations (index builds) started by an earlier migration
export const WSCHAT_BRIDGE_SCHEMA_BUSY_MAX_WAIT_MS = 90_000;
export const WSCHAT_BRIDGE_SCHEMA_BUSY_INITIAL_DELAY_MS = 1_000;
export const WSCHAT_BRIDGE_SCHEMA_BUSY_MAX_DELAY_MS = 10_000;
