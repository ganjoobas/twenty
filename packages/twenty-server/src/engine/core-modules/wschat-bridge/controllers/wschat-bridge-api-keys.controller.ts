import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import {
  type WschatBridgeApiKeyDTO,
  type WschatBridgeCreatedApiKeyDTO,
  type WschatBridgeRevokedApiKeyDTO,
} from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-api-key.dto';
import { WschatBridgeCreateApiKeyInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-create-api-key.input';
import { WschatBridgeExceptionFilter } from 'src/engine/core-modules/wschat-bridge/filters/wschat-bridge-exception.filter';
import { WschatBridgeSecretGuard } from 'src/engine/core-modules/wschat-bridge/guards/wschat-bridge-secret.guard';
import { WschatBridgeServiceUserConfiguredGuard } from 'src/engine/core-modules/wschat-bridge/guards/wschat-bridge-service-user-configured.guard';
import { WschatBridgeApiKeysService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-api-keys.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';

@Controller('wschat-bridge/workspaces/:workspaceId/api-keys')
@UseGuards(
  WschatBridgeSecretGuard,
  WschatBridgeServiceUserConfiguredGuard,
  PublicEndpointGuard,
  NoPermissionGuard,
)
@UseFilters(WschatBridgeExceptionFilter)
@UsePipes(new ValidationPipe({ whitelist: true }))
export class WschatBridgeApiKeysController {
  constructor(private readonly apiKeysService: WschatBridgeApiKeysService) {}

  @Get()
  async listApiKeys(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ): Promise<WschatBridgeApiKeyDTO[]> {
    return this.apiKeysService.listApiKeys(workspaceId);
  }

  @Post()
  @HttpCode(201)
  async createApiKey(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: WschatBridgeCreateApiKeyInput,
  ): Promise<WschatBridgeCreatedApiKeyDTO> {
    return this.apiKeysService.createApiKey(workspaceId, body);
  }

  @Delete(':apiKeyId')
  @HttpCode(200)
  async revokeApiKey(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('apiKeyId', new ParseUUIDPipe()) apiKeyId: string,
  ): Promise<WschatBridgeRevokedApiKeyDTO> {
    return this.apiKeysService.revokeApiKey(workspaceId, apiKeyId);
  }
}
