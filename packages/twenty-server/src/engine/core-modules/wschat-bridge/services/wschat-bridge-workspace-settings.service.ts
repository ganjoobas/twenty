import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { type UpdateWorkspaceInput } from 'src/engine/core-modules/workspace/dtos/update-workspace-input';
import { WorkspaceService } from 'src/engine/core-modules/workspace/services/workspace.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { normalizeBridgeEmbeddingOrigins } from 'src/engine/core-modules/wschat-bridge/utils/normalize-bridge-embedding-origins.util';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

export type WschatBridgeWorkspaceCoreFields = Pick<
  UpdateWorkspaceInput,
  | 'displayName'
  | 'subdomain'
  | 'isPublicInviteLinkEnabled'
  | 'isPasswordAuthEnabled'
>;

@Injectable()
// oxlint-disable-next-line twenty/inject-workspace-repository
export class WschatBridgeWorkspaceSettingsService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly workspaceService: WorkspaceService,
  ) {}

  normalizeEmbeddingOriginsOrThrow(origins: string[]): string[] {
    const result = normalizeBridgeEmbeddingOrigins(origins);

    if (result.kind === 'invalid') {
      throw wschatBridgeHttpException(
        HttpStatus.BAD_REQUEST,
        WSCHAT_BRIDGE_ERROR_CODES.EMBEDDING_ORIGIN_INVALID,
        `Not an HTTP(S) origin without path or wildcard: ${result.origin}`,
      );
    }

    if (result.kind === 'tooMany') {
      throw wschatBridgeHttpException(
        HttpStatus.BAD_REQUEST,
        WSCHAT_BRIDGE_ERROR_CODES.TOO_MANY_EMBEDDING_ORIGINS,
        `Too many embedding origins: ${result.count}`,
      );
    }

    return result.origins;
  }

  // Goes through updateWorkspaceById (subdomain re-validation, custom-domain bookkeeping, cache invalidation).
  // It checks permission flags against the request auth context; the system context passes them, as for crons.
  // The userWorkspaceId is only required to be present on an activated workspace, so any member's id serves.
  async updateCoreFields({
    workspaceId,
    fields,
  }: {
    workspaceId: string;
    fields: WschatBridgeWorkspaceCoreFields;
  }): Promise<void> {
    const definedFields = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => isDefined(value)),
    ) as WschatBridgeWorkspaceCoreFields;

    if (Object.keys(definedFields).length === 0) {
      return;
    }

    const anyUserWorkspace = await this.userWorkspaceRepository.findOne({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });

    await withWorkspaceAuthContext(buildSystemAuthContext(workspaceId), () =>
      this.workspaceService.updateWorkspaceById({
        payload: { ...definedFields, id: workspaceId },
        userWorkspaceId: anyUserWorkspace?.id,
      }),
    );
  }

  // The upstream API edits one origin at a time; removals go first so the 20-origin cap is never crossed mid-way.
  // Not atomic across origins, but every origin was validated before the first write.
  async setEmbeddingOrigins({
    workspaceId,
    origins,
  }: {
    workspaceId: string;
    origins: string[];
  }): Promise<void> {
    const workspace = await this.workspaceRepository.findOneByOrFail({
      id: workspaceId,
    });

    const currentOrigins = workspace.allowedEmbeddingOrigins ?? [];

    for (const origin of currentOrigins.filter((o) => !origins.includes(o))) {
      await this.workspaceService.updateWorkspaceAllowedEmbeddingOrigins(
        workspaceId,
        { operation: 'remove', origin },
      );
    }

    for (const origin of origins.filter((o) => !currentOrigins.includes(o))) {
      await this.workspaceService.updateWorkspaceAllowedEmbeddingOrigins(
        workspaceId,
        { operation: 'add', origin },
      );
    }
  }
}
