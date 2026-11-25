import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { type WschatBridgeMemberDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-member.dto';
import { WschatBridgeServiceUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-service-user.service';
import { toBridgeRoleName } from 'src/engine/core-modules/wschat-bridge/utils/to-bridge-role-name.util';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';
import { RolePermissionsService } from 'src/engine/permissions/role-permissions.service';

@Injectable()
export class WschatBridgeMemberReadService {
  constructor(
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly userService: UserService,
    private readonly rolePermissionsService: RolePermissionsService,
    private readonly serviceUserService: WschatBridgeServiceUserService,
  ) {}

  async listMembers(
    workspace: WorkspaceEntity,
  ): Promise<WschatBridgeMemberDTO[]> {
    const userWorkspaces = await this.userWorkspaceRepository.find({
      where: { workspaceId: workspace.id },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });

    return this.toMemberDTOs(workspace, userWorkspaces);
  }

  async getMemberOrThrow(
    workspace: WorkspaceEntity,
    userId: string,
  ): Promise<WschatBridgeMemberDTO> {
    const userWorkspaces = await this.userWorkspaceRepository.find({
      where: { workspaceId: workspace.id, userId },
      relations: { user: true },
    });

    const [member] = await this.toMemberDTOs(workspace, userWorkspaces);

    if (!isDefined(member)) {
      throw wschatBridgeHttpException(
        HttpStatus.NOT_FOUND,
        WSCHAT_BRIDGE_ERROR_CODES.MEMBER_NOT_FOUND,
        'Workspace member not found',
      );
    }

    return member;
  }

  // Names come from workspaceMember (what Twenty shows), falling back to core.user while the member row is missing
  private async toMemberDTOs(
    workspace: WorkspaceEntity,
    userWorkspaces: UserWorkspaceEntity[],
  ): Promise<WschatBridgeMemberDTO[]> {
    // The service user is WSChat's own and never reported as a member
    const userWorkspacesWithUser = userWorkspaces.filter(
      (userWorkspace) =>
        isDefined(userWorkspace.user) &&
        !this.serviceUserService.isServiceUserEmail(userWorkspace.user.email),
    );

    if (userWorkspacesWithUser.length === 0) {
      return [];
    }

    const workspaceMembers =
      await this.userService.loadWorkspaceMembers(workspace);

    const workspaceMemberByUserId = new Map(
      workspaceMembers.map((workspaceMember) => [
        workspaceMember.userId,
        workspaceMember,
      ]),
    );

    const rolesByUserWorkspaceId =
      await this.rolePermissionsService.findRolesByUserWorkspaceIds({
        userWorkspaceIds: userWorkspacesWithUser.map(({ id }) => id),
        workspaceId: workspace.id,
      });

    return userWorkspacesWithUser.map((userWorkspace) => {
      const workspaceMember = workspaceMemberByUserId.get(userWorkspace.userId);

      return {
        email: userWorkspace.user.email,
        firstName:
          workspaceMember?.name?.firstName ?? userWorkspace.user.firstName,
        lastName:
          workspaceMember?.name?.lastName ?? userWorkspace.user.lastName,
        role: toBridgeRoleName(
          rolesByUserWorkspaceId.get(userWorkspace.id)?.[0],
        ),
        isDisabled: userWorkspace.user.disabled,
      };
    });
  }
}
