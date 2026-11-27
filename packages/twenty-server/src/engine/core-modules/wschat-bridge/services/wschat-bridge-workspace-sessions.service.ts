import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { In, IsNull, Repository } from 'typeorm';

import {
  AppTokenEntity,
  AppTokenType,
} from 'src/engine/core-modules/app-token/app-token.entity';
import { UserSessionService } from 'src/engine/core-modules/user-session/services/user-session.service';
import { UserSessionRevokedReason } from 'src/engine/core-modules/user-session/types/user-session-revoked-reason.type';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { WschatBridgeServiceUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-service-user.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';

export type WschatBridgeClosedSessionsDTO = {
  // Members whose sessions or refresh tokens in this workspace were closed
  closedMembers: number;
  // Browser sessions closed (refresh tokens are not counted here)
  closedSessions: number;
};

// Every member's way back in, this workspace only: browser sessions through upstream's revokeAllSessionsForUser
// (which drops their cache entries), and refresh tokens, which upstream ties to no session
@Injectable()
export class WschatBridgeWorkspaceSessionsService {
  private readonly logger = new Logger(
    WschatBridgeWorkspaceSessionsService.name,
  );

  constructor(
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    @InjectRepository(AppTokenEntity)
    private readonly appTokenRepository: Repository<AppTokenEntity>,
    private readonly userSessionService: UserSessionService,
    private readonly serviceUserService: WschatBridgeServiceUserService,
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
  ) {}

  async closeAllSessions(
    workspaceId: string,
  ): Promise<WschatBridgeClosedSessionsDTO> {
    const workspace =
      await this.workspaceLookupService.findOrThrow(workspaceId);

    const userIds = (
      await this.userWorkspaceRepository.find({
        where: { workspaceId: workspace.id },
        relations: { user: true },
      })
    )
      // A soft-deleted user loads without its user row; its sessions are closed too
      .filter(
        ({ user }) =>
          !isDefined(user) ||
          !this.serviceUserService.isServiceUserEmail(user.email),
      )
      .map(({ userId }) => userId);

    const closedUserIds = new Set<string>();
    let closedSessions = 0;

    for (const userId of userIds) {
      const closed = await this.userSessionService.revokeAllSessionsForUser({
        userId,
        workspaceId: workspace.id,
        reason: UserSessionRevokedReason.UserRevoked,
      });

      if (closed > 0) {
        closedUserIds.add(userId);
        closedSessions += closed;
      }
    }

    for (const userId of await this.revokeRefreshTokens(
      workspace.id,
      userIds,
    )) {
      closedUserIds.add(userId);
    }

    this.logger.log(
      `Workspace ${workspace.id}: closed ${closedSessions} session(s) of ${closedUserIds.size} member(s)`,
    );

    return { closedMembers: closedUserIds.size, closedSessions };
  }

  // A recorded reason makes the refresh path refuse at once, without the renewal grace (isRevokedRefreshTokenStillRenewable)
  private async revokeRefreshTokens(
    workspaceId: string,
    userIds: string[],
  ): Promise<string[]> {
    if (userIds.length === 0) {
      return [];
    }

    const { raw } = await this.appTokenRepository
      .createQueryBuilder()
      .update(AppTokenEntity)
      .set({
        revokedAt: new Date(),
        context: () =>
          `COALESCE("context", '{}'::jsonb) || jsonb_build_object('revokedReason', '${UserSessionRevokedReason.UserRevoked}')`,
      })
      .where({
        workspaceId,
        userId: In(userIds),
        type: AppTokenType.RefreshToken,
        revokedAt: IsNull(),
      })
      .returning(['userId'])
      .execute();

    return (raw as { userId: string }[]).map(({ userId }) => userId);
  }
}
