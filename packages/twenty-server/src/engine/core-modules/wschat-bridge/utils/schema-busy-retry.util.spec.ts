import {
  computeSchemaBusyRetryDelays,
  isSchemaBusyError,
} from 'src/engine/core-modules/wschat-bridge/utils/schema-busy-retry.util';
import {
  WorkspaceMigrationRunnerException,
  WorkspaceMigrationRunnerExceptionCode,
} from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/exceptions/workspace-migration-runner.exception';

describe('computeSchemaBusyRetryDelays', () => {
  it('should double the delay up to the cap and stay within the total budget', () => {
    const delays = computeSchemaBusyRetryDelays({
      maxTotalMs: 90_000,
      initialDelayMs: 1_000,
      maxDelayMs: 10_000,
    });

    expect(delays.slice(0, 5)).toEqual([1_000, 2_000, 4_000, 8_000, 10_000]);
    expect(delays.reduce((sum, delay) => sum + delay, 0)).toBeLessThanOrEqual(
      90_000,
    );
    expect(Math.max(...delays)).toBe(10_000);
  });

  it('should give no retry when the budget is smaller than the first delay', () => {
    expect(
      computeSchemaBusyRetryDelays({
        maxTotalMs: 500,
        initialDelayMs: 1_000,
        maxDelayMs: 10_000,
      }),
    ).toEqual([]);
  });
});

describe('isSchemaBusyError', () => {
  it('should match only the deferred-operations-in-progress refusal', () => {
    expect(
      isSchemaBusyError(
        new WorkspaceMigrationRunnerException({
          message: 'busy',
          code: WorkspaceMigrationRunnerExceptionCode.DEFERRED_WORKSPACE_MIGRATION_ACTIONS_IN_PROGRESS,
        }),
      ),
    ).toBe(true);
    expect(
      isSchemaBusyError(
        new WorkspaceMigrationRunnerException({
          message: 'locked',
          code: WorkspaceMigrationRunnerExceptionCode.DDL_LOCKED,
        }),
      ),
    ).toBe(false);
    expect(isSchemaBusyError(new Error('busy'))).toBe(false);
  });
});
