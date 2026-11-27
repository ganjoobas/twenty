import { WschatBridgeSampleRecordsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-sample-records.service';
import { PREFILL_COMPANY_ROWS } from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-companies.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('WschatBridgeSampleRecordsService', () => {
  const queries: { sql: string; ids: string[] }[] = [];
  const manager = {
    query: jest.fn(async (sql: string, [ids]: [string[]]) => {
      queries.push({ sql, ids });

      return [[], ids.length];
    }),
  };
  const workspaceRepository = {
    manager: {
      transaction: jest.fn(
        async (run: (transactionManager: typeof manager) => Promise<void>) =>
          run(manager),
      ),
    },
  };
  const service = new WschatBridgeSampleRecordsService(
    workspaceRepository as never,
  );

  beforeEach(() => {
    queries.length = 0;
  });

  it('should remove for good, in one transaction, the samples upstream inserts, dependants first', async () => {
    const removed = await service.removeSampleRecords(WORKSPACE_ID);

    expect(removed).toEqual({ opportunity: 6, person: 5, company: 5 });
    expect(workspaceRepository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(queries.map(({ sql }) => sql)).toEqual(
      ['opportunity', 'person', 'company'].map(
        (table) =>
          `DELETE FROM "${getWorkspaceSchemaName(WORKSPACE_ID)}"."${table}" WHERE "id" = ANY($1::uuid[])`,
      ),
    );
  });

  it('should target exactly the sample companies upstream ships', async () => {
    await service.removeSampleRecords(WORKSPACE_ID);

    expect([...queries[2].ids].sort()).toEqual(
      PREFILL_COMPANY_ROWS.map(({ id }) => id).sort(),
    );
  });
});
