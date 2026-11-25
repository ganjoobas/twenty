import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { type WschatBridgeLoginLinkDTO } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-login-link.dto';
import { WschatBridgeLoginLinkInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-login-link.input';
import { WschatBridgeSecretGuard } from 'src/engine/core-modules/wschat-bridge/guards/wschat-bridge-secret.guard';
import { WschatBridgeService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';

// Server-to-server only: no Twenty session exists here, WschatBridgeSecretGuard is the authentication
@Controller('wschat-bridge')
export class WschatBridgeController {
  constructor(private readonly wschatBridgeService: WschatBridgeService) {}

  @Post('login-link')
  @HttpCode(200)
  @UseGuards(WschatBridgeSecretGuard, PublicEndpointGuard, NoPermissionGuard)
  @UsePipes(new ValidationPipe())
  async createLoginLink(
    @Body() body: WschatBridgeLoginLinkInput,
  ): Promise<WschatBridgeLoginLinkDTO> {
    return this.wschatBridgeService.createLoginLink(body);
  }
}
