import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WSCHAT_BRIDGE_SAMPLE_RECORDS } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-sample-records.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

// A bridge workspace starts without upstream's sample records: WSChat loads the company's own data.
// Plain SQL like the prefill itself, so nothing goes to the trash and no workflow sees a deletion
@Injectable()
export class WschatBridgeSampleRecordsService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
  ) {}

  // Rows removed per table; only right after creation, before anyone could have used them
  async removeSampleRecords(
    workspaceId: string,
  ): Promise<Record<string, number>> {
    const schemaName = getWorkspaceSchemaName(workspaceId);
    const removed: Record<string, number> = {};

    await this.workspaceRepository.manager.transaction(async (manager) => {
      for (const { table, ids } of WSCHAT_BRIDGE_SAMPLE_RECORDS) {
        // TypeORM answers a Postgres DELETE with [rows, affected]
        const result: unknown = await manager.query(
          `DELETE FROM "${schemaName}"."${table}" WHERE "id" = ANY($1::uuid[])`,
          [ids],
        );

        removed[table] =
          Array.isArray(result) && typeof result[1] === 'number'
            ? result[1]
            : 0;
      }
    });

    return removed;
  }
}
