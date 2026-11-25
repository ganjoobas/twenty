import {
  WorkspaceMigrationRunnerException,
  WorkspaceMigrationRunnerExceptionCode,
} from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/exceptions/workspace-migration-runner.exception';
import {
  WSCHAT_BRIDGE_SCHEMA_BUSY_INITIAL_DELAY_MS,
  WSCHAT_BRIDGE_SCHEMA_BUSY_MAX_DELAY_MS,
  WSCHAT_BRIDGE_SCHEMA_BUSY_MAX_WAIT_MS,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-schema-busy.constant';

// Raised by WorkspaceMigrationRunnerService.run before a schema-affecting migration while deferred operations of
// this workspace are PENDING or IN_PROGRESS (in-flight-deferred-workspace-operations.service.ts)
export const isSchemaBusyError = (error: unknown): boolean =>
  error instanceof WorkspaceMigrationRunnerException &&
  error.code ===
    WorkspaceMigrationRunnerExceptionCode.DEFERRED_WORKSPACE_MIGRATION_ACTIONS_IN_PROGRESS;

// Doubling waits capped per step, whose sum never exceeds the total budget
export const computeSchemaBusyRetryDelays = ({
  maxTotalMs,
  initialDelayMs,
  maxDelayMs,
}: {
  maxTotalMs: number;
  initialDelayMs: number;
  maxDelayMs: number;
}): number[] => {
  const delays: number[] = [];
  let elapsedMs = 0;
  let nextDelayMs = initialDelayMs;

  while (nextDelayMs > 0 && elapsedMs + nextDelayMs <= maxTotalMs) {
    delays.push(nextDelayMs);
    elapsedMs += nextDelayMs;
    nextDelayMs = Math.min(nextDelayMs * 2, maxDelayMs);
  }

  return delays;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

// Runs a metadata migration, retrying only while the schema is busy; the last busy error propagates (SCHEMA_BUSY)
export const retryWhileSchemaBusy = async <TResult>(
  runMigration: () => Promise<TResult>,
): Promise<TResult> => {
  const delays = computeSchemaBusyRetryDelays({
    maxTotalMs: WSCHAT_BRIDGE_SCHEMA_BUSY_MAX_WAIT_MS,
    initialDelayMs: WSCHAT_BRIDGE_SCHEMA_BUSY_INITIAL_DELAY_MS,
    maxDelayMs: WSCHAT_BRIDGE_SCHEMA_BUSY_MAX_DELAY_MS,
  });

  for (const delayMs of delays) {
    try {
      return await runMigration();
    } catch (error) {
      if (!isSchemaBusyError(error)) {
        throw error;
      }

      await sleep(delayMs);
    }
  }

  return runMigration();
};
