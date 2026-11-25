import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { WschatBridgeCreateWorkspaceInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-create-workspace.input';
import { type WschatBridgeEnforceReportDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-enforce-report.dto';
import { WschatBridgeEnforceInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-enforce.input';
import {
  type WschatBridgeRemovedMemberDTO,
  type WschatBridgeUpsertedMemberDTO,
} from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-member.dto';
import { WschatBridgeRemoveMemberInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-remove-member.input';
import { WschatBridgeUpdateWorkspaceInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-update-workspace.input';
import { WschatBridgeUpsertMemberInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-upsert-member.input';
import {
  type WschatBridgeCreatedWorkspaceDTO,
  type WschatBridgeWorkspaceDTO,
} from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-workspace.dto';
import { WschatBridgeExceptionFilter } from 'src/engine/core-modules/wschat-bridge/filters/wschat-bridge-exception.filter';
import { WschatBridgeServiceUserConfiguredGuard } from 'src/engine/core-modules/wschat-bridge/guards/wschat-bridge-service-user-configured.guard';
import { WschatBridgeSecretGuard } from 'src/engine/core-modules/wschat-bridge/guards/wschat-bridge-secret.guard';
import { WschatBridgeMemberReadService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-read.service';
import { WschatBridgeMemberRemovalService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-removal.service';
import { WschatBridgeMemberTwoFactorService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-two-factor.service';
import { WschatBridgeMemberUpsertService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-upsert.service';
import { WschatBridgeWorkspaceEnforcementService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-enforcement.service';
import { WschatBridgeWorkspaceCreationService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-creation.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { WschatBridgeWorkspaceUpdateService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-update.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';

// Server-to-server only, like the login link: WschatBridgeSecretGuard is the authentication, no Twenty session exists
@Controller('wschat-bridge/workspaces')
@UseGuards(
  WschatBridgeSecretGuard,
  WschatBridgeServiceUserConfiguredGuard,
  PublicEndpointGuard,
  NoPermissionGuard,
)
@UseFilters(WschatBridgeExceptionFilter)
@UsePipes(new ValidationPipe({ whitelist: true }))
export class WschatBridgeWorkspacesController {
  constructor(
    private readonly workspaceCreationService: WschatBridgeWorkspaceCreationService,
    private readonly workspaceUpdateService: WschatBridgeWorkspaceUpdateService,
    private readonly workspaceLookupService: WschatBridgeWorkspaceLookupService,
    private readonly memberReadService: WschatBridgeMemberReadService,
    private readonly memberUpsertService: WschatBridgeMemberUpsertService,
    private readonly memberRemovalService: WschatBridgeMemberRemovalService,
    private readonly memberTwoFactorService: WschatBridgeMemberTwoFactorService,
    private readonly workspaceEnforcementService: WschatBridgeWorkspaceEnforcementService,
  ) {}

  @Post()
  @HttpCode(201)
  async createWorkspace(
    @Body() body: WschatBridgeCreateWorkspaceInput,
  ): Promise<WschatBridgeCreatedWorkspaceDTO> {
    return this.workspaceCreationService.createWorkspace(body);
  }

  @Get(':workspaceId')
  async getWorkspace(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ): Promise<WschatBridgeWorkspaceDTO> {
    return this.describeWorkspace(workspaceId);
  }

  @Patch(':workspaceId')
  @HttpCode(200)
  async updateWorkspace(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: WschatBridgeUpdateWorkspaceInput,
  ): Promise<WschatBridgeWorkspaceDTO> {
    await this.workspaceUpdateService.updateWorkspace(workspaceId, body);

    return this.describeWorkspace(workspaceId);
  }

  @Put(':workspaceId/members')
  @HttpCode(200)
  async upsertMember(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: WschatBridgeUpsertMemberInput,
  ): Promise<WschatBridgeUpsertedMemberDTO> {
    return this.memberUpsertService.upsertMember(workspaceId, body);
  }

  @Delete(':workspaceId/members')
  @HttpCode(200)
  async removeMember(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: WschatBridgeRemoveMemberInput,
  ): Promise<WschatBridgeRemovedMemberDTO> {
    return this.memberRemovalService.removeMember(workspaceId, body.email);
  }

  // Body is just { email }, the same shape as member removal
  @Post(':workspaceId/members/reset-two-factor')
  @HttpCode(200)
  async resetMemberTwoFactor(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: WschatBridgeRemoveMemberInput,
  ): Promise<{ reset: boolean }> {
    return this.memberTwoFactorService.resetTwoFactor(workspaceId, body.email);
  }

  @Post(':workspaceId/enforce')
  @HttpCode(200)
  async enforceWorkspace(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: WschatBridgeEnforceInput,
  ): Promise<WschatBridgeEnforceReportDTO> {
    return this.workspaceEnforcementService.enforce(
      workspaceId,
      body.adminRoleLabel,
    );
  }

  private async describeWorkspace(
    workspaceId: string,
  ): Promise<WschatBridgeWorkspaceDTO> {
    const workspace =
      await this.workspaceLookupService.findOrThrow(workspaceId);

    return {
      workspaceId: workspace.id,
      displayName: workspace.displayName ?? '',
      subdomain: workspace.subdomain,
      url: this.workspaceLookupService.buildUrl(workspace),
      activationStatus: workspace.activationStatus,
      members: await this.memberReadService.listMembers(workspace),
    };
  }
}
