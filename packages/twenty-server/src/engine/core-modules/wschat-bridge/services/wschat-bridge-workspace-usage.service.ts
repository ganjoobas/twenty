import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { join } from 'path';

import { Repository } from 'typeorm';

import { StorageDriverType } from 'src/engine/core-modules/file-storage/interfaces/file-storage.interface';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import {
  measureFolderSize,
  type WschatBridgeFolderSize,
} from 'src/engine/core-modules/wschat-bridge/utils/measure-folder-size.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { resolveAbsolutePath } from 'src/utils/resolve-absolute-path';

// Bounds one walk of a large folder; the caller asks at most hourly
const FILES_WALK_BUDGET_MS = 10_000;

export type WschatBridgeWorkspaceUsageDTO = {
  databaseBytes: number;
  // null: the storage is not local (S3), so files are not measured here
  filesBytes: number | null;
  // false: the folder walk hit its time budget and filesBytes is a lower bound
  filesComplete: boolean;
  totalBytes: number;
  measuredAt: string;
};

// Read-only: tables, indexes and TOAST of the workspace schema, plus its folder in local storage
@Injectable()
export class WschatBridgeWorkspaceUsageService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async measure(workspaceId: string): Promise<WschatBridgeWorkspaceUsageDTO> {
    const workspace =
      await this.workspaceLookupService.findOrThrow(workspaceId);
    const [databaseBytes, files] = await Promise.all([
      this.measureSchema(workspace.id),
      this.measureFiles(workspace.id),
    ]);

    return {
      databaseBytes,
      filesBytes: files?.bytes ?? null,
      filesComplete: files?.isComplete ?? false,
      totalBytes: databaseBytes + (files?.bytes ?? 0),
      measuredAt: new Date().toISOString(),
    };
  }

  // Local storage keeps a workspace's files in <STORAGE_LOCAL_PATH>/<workspaceId> (FileStorageService)
  async measureFiles(
    workspaceId: string,
  ): Promise<WschatBridgeFolderSize | null> {
    if (
      this.twentyConfigService.get('STORAGE_TYPE') !== StorageDriverType.LOCAL
    ) {
      return null;
    }

    return measureFolderSize({
      folderPath: join(
        resolveAbsolutePath(this.twentyConfigService.get('STORAGE_LOCAL_PATH')),
        workspaceId,
      ),
      deadline: Date.now() + FILES_WALK_BUDGET_MS,
    });
  }

  private async measureSchema(workspaceId: string): Promise<number> {
    // pg_total_relation_size of a table already includes its indexes and TOAST
    const [row]: { bytes: string | null }[] =
      await this.workspaceRepository.query(
        `SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)::bigint AS bytes
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind IN ('r', 'm')`,
        [getWorkspaceSchemaName(workspaceId)],
      );

    return Number(row?.bytes ?? 0);
  }
}
