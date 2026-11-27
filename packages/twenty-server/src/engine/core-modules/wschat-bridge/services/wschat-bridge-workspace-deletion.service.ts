import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { In, IsNull, Repository } from 'typeorm';

import { CoreEntityCacheService } from 'src/engine/core-entity-cache/services/core-entity-cache.service';
import { FileService } from 'src/engine/core-modules/file/services/file.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  WorkspaceException,
  WorkspaceExceptionCode,
} from 'src/engine/core-modules/workspace/workspace.exception';
import { WorkspaceService } from 'src/engine/core-modules/workspace/services/workspace.service';
import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { WschatBridgeServiceUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-service-user.service';
import { WschatBridgeWorkspaceUsageService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-usage.service';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';

export type WschatBridgeDeletedWorkspaceDTO = {
  deleted: true;
  workspaceId: string;
  // Measured just before removal; null when the storage is not local
  filesBytes: number | null;
  // Members whose only workspace this was, removed from core.user
  usersRemoved: number;
  // Members of other workspaces, the service user and server admins
  usersKept: number;
  // Users upstream soft-deleted that could not be removed for good (a foreign key held them)
  usersLeftSoftDeleted: number;
};

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Immediate and complete (README, "DELETE …/workspaces/:id"): upstream's own hard delete, then what it leaves:
// the folder is removed now instead of by its queued job, and users it only soft-deletes are removed for good
@Injectable()
export class WschatBridgeWorkspaceDeletionService {
  private readonly logger = new Logger(
    WschatBridgeWorkspaceDeletionService.name,
  );

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly workspaceService: WorkspaceService,
    private readonly fileService: FileService,
    private readonly usageService: WschatBridgeWorkspaceUsageService,
    private readonly serviceUserService: WschatBridgeServiceUserService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly coreEntityCacheService: CoreEntityCacheService,
  ) {}

  async deleteWorkspace(
    workspaceId: string,
    confirmSubdomain: string,
  ): Promise<WschatBridgeDeletedWorkspaceDTO> {
    // Soft-deleted ones too: a half-finished deletion is finished, not refused
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
      withDeleted: true,
    });

    if (!isDefined(workspace)) {
      throw wschatBridgeHttpException(
        HttpStatus.NOT_FOUND,
        WSCHAT_BRIDGE_ERROR_CODES.WORKSPACE_NOT_FOUND,
        'Workspace not found',
      );
    }

    if (workspace.subdomain !== confirmSubdomain.trim().toLowerCase()) {
      throw wschatBridgeHttpException(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.CONFIRMATION_MISMATCH,
        'confirmSubdomain is not the subdomain of this workspace',
      );
    }

    if (
      workspace.id === this.twentyConfigService.get('SERVER_ADMIN_WORKSPACE_ID')
    ) {
      throw wschatBridgeHttpException(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.SYSTEM_WORKSPACE,
        'The server admin workspace (SERVER_ADMIN_WORKSPACE_ID) is never deleted',
      );
    }

    const memberUserIds = (
      await this.userWorkspaceRepository.find({
        where: { workspaceId: workspace.id },
        withDeleted: true,
        select: { userId: true },
      })
    ).map(({ userId }) => userId);

    const files = await this.measureFilesOrNull(workspace.id);

    // Before upstream's delete, so a repeated call after a later failure still finds and finishes everything
    await this.fileService.deleteWorkspaceFolder(workspace.id);

    try {
      await this.workspaceService.deleteWorkspace(workspace.id, false);
    } catch (error) {
      if (
        error instanceof WorkspaceException &&
        error.code === WorkspaceExceptionCode.APPLICATION_UNINSTALL_IN_PROGRESS
      ) {
        throw wschatBridgeHttpException(
          HttpStatus.CONFLICT,
          WSCHAT_BRIDGE_ERROR_CODES.WORKSPACE_BUSY,
          'An application is being uninstalled from this workspace; repeat the call later',
        );
      }

      throw error;
    }

    const users = await this.removeOrphanedUsers(memberUserIds);

    this.logger.log(
      `Workspace ${workspace.id}: deleted for good (files ${files?.bytes ?? 'not measured'} bytes, users removed ${users.usersRemoved}, kept ${users.usersKept}, left soft-deleted ${users.usersLeftSoftDeleted})`,
    );

    return {
      deleted: true,
      workspaceId: workspace.id,
      filesBytes: files?.bytes ?? null,
      ...users,
    };
  }

  private async measureFilesOrNull(workspaceId: string) {
    try {
      return await this.usageService.measureFiles(workspaceId);
    } catch (error) {
      this.logger.warn(
        `Workspace ${workspaceId}: files not measured before deletion: ${describeError(error)}`,
      );

      return null;
    }
  }

  // Upstream soft-deletes a member whose last workspace this was (handleRemoveWorkspaceMember) and never removes users
  private async removeOrphanedUsers(
    userIds: string[],
  ): Promise<
    Pick<
      WschatBridgeDeletedWorkspaceDTO,
      'usersRemoved' | 'usersKept' | 'usersLeftSoftDeleted'
    >
  > {
    const result = { usersRemoved: 0, usersKept: 0, usersLeftSoftDeleted: 0 };

    if (userIds.length === 0) {
      return result;
    }

    const users = await this.userRepository.find({
      where: { id: In(userIds) },
      withDeleted: true,
    });
    const stillMemberUserIds = new Set(
      (
        await this.userWorkspaceRepository.find({
          where: { userId: In(userIds), deletedAt: IsNull() },
          select: { userId: true },
        })
      ).map(({ userId }) => userId),
    );

    for (const user of users) {
      const isProtected =
        this.serviceUserService.isServiceUserEmail(user.email) ||
        user.canAccessFullAdminPanel ||
        user.canImpersonate;

      if (isProtected || stillMemberUserIds.has(user.id)) {
        // The service user's or an admin's last workspace still never takes the account with it
        if (isProtected && isDefined(user.deletedAt)) {
          await this.userRepository.restore(user.id);
          await this.coreEntityCacheService.invalidate('user', user.id);
        }

        result.usersKept++;
        continue;
      }

      try {
        await this.userRepository.delete(user.id);
        await this.coreEntityCacheService.invalidate('user', user.id);
        result.usersRemoved++;
      } catch (error) {
        this.logger.warn(
          `User ${user.id}: left soft-deleted, could not be removed: ${describeError(error)}`,
        );
        result.usersLeftSoftDeleted++;
      }
    }

    return result;
  }
}
