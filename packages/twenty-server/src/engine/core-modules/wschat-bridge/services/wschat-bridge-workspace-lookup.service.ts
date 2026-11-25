import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { Repository } from 'typeorm';

import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { wschatBridgeHttpException } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';

// Not provisioned yet: there may be no workspace schema, member rows or roles to work with
const NOT_READY_ACTIVATION_STATUSES: WorkspaceActivationStatus[] = [
  WorkspaceActivationStatus.PENDING_CREATION,
  WorkspaceActivationStatus.ONGOING_CREATION,
];

@Injectable()
export class WschatBridgeWorkspaceLookupService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly workspaceDomainsService: WorkspaceDomainsService,
  ) {}

  // Soft-deleted workspaces are excluded by TypeORM's @DeleteDateColumn and answer 404 like unknown ones
  async findOrThrow(workspaceId: string): Promise<WorkspaceEntity> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
    });

    if (!isDefined(workspace)) {
      throw wschatBridgeHttpException(
        HttpStatus.NOT_FOUND,
        WSCHAT_BRIDGE_ERROR_CODES.WORKSPACE_NOT_FOUND,
        'Workspace not found',
      );
    }

    return workspace;
  }

  async findProvisionedOrThrow(workspaceId: string): Promise<WorkspaceEntity> {
    const workspace = await this.findOrThrow(workspaceId);

    if (NOT_READY_ACTIVATION_STATUSES.includes(workspace.activationStatus)) {
      throw wschatBridgeHttpException(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.WORKSPACE_NOT_READY,
        'Workspace is still being created',
      );
    }

    return workspace;
  }

  // Same builder as the login link, so custom domains and subdomains are honoured identically
  buildUrl(workspace: WorkspaceEntity): string {
    return this.workspaceDomainsService
      .buildWorkspaceURL({ workspace })
      .toString();
  }
}
