import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { WorkspaceDomainsModule } from 'src/engine/core-modules/domain/workspace-domains/workspace-domains.module';
import { UserWorkspaceModule } from 'src/engine/core-modules/user-workspace/user-workspace.module';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WschatBridgeController } from 'src/engine/core-modules/wschat-bridge/controllers/wschat-bridge.controller';
import { WschatBridgeSecretGuard } from 'src/engine/core-modules/wschat-bridge/guards/wschat-bridge-secret.guard';
import { WschatBridgeService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceEntity, UserEntity]),
    TokenModule,
    WorkspaceDomainsModule,
    UserWorkspaceModule,
  ],
  providers: [WschatBridgeService, WschatBridgeSecretGuard],
  controllers: [WschatBridgeController],
})
export class WschatBridgeModule {}
