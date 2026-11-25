import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { type WschatBridgeMemberProfileInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-member-profile.input';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

@Injectable()
export class WschatBridgeMemberSettingsService {
  constructor(
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
  ) {}

  // Same writes as the updateWorkspaceMemberSettings mutation (workspaceMember row + userWorkspace.locale), without a session.
  // Unlike the login link, a failure here is an error: the caller asked for exactly these values
  async apply({
    workspaceId,
    userId,
    userWorkspaceId,
    profile,
  }: {
    workspaceId: string;
    userId: string;
    userWorkspaceId: string;
    profile: Pick<
      WschatBridgeMemberProfileInput,
      'firstName' | 'lastName' | 'locale' | 'colorScheme'
    >;
  }): Promise<void> {
    const { locale, colorScheme } = profile;

    await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const workspaceMemberRepository =
        this.workspaceOrmManager.getRepositoryWithoutPermissionChecks<WorkspaceMemberWorkspaceEntity>(
          'workspaceMember',
        );

      const workspaceMember = await workspaceMemberRepository.findOne({
        where: { userId },
      });

      if (!isDefined(workspaceMember)) {
        throw new Error(
          `Workspace member row not found in workspace ${workspaceId}`,
        );
      }

      await workspaceMemberRepository.save({
        id: workspaceMember.id,
        name: {
          firstName: profile.firstName.trim(),
          lastName: profile.lastName.trim(),
        },
        ...(isDefined(locale) ? { locale } : {}),
        ...(isDefined(colorScheme) ? { colorScheme } : {}),
      });
    }, buildSystemAuthContext(workspaceId));

    if (isDefined(locale)) {
      await this.userWorkspaceService.updateUserWorkspaceLocaleForUserWorkspace(
        { locale, userWorkspaceId },
      );
    }
  }
}
