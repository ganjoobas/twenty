import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from 'src/engine/core-modules/auth/auth.module';
import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { SubdomainManagerModule } from 'src/engine/core-modules/domain/subdomain-manager/subdomain-manager.module';
import { WorkspaceDomainsModule } from 'src/engine/core-modules/domain/workspace-domains/workspace-domains.module';
import { OnboardingModule } from 'src/engine/core-modules/onboarding/onboarding.module';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserWorkspaceModule } from 'src/engine/core-modules/user-workspace/user-workspace.module';
import { UserModule } from 'src/engine/core-modules/user/user.module';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceModule } from 'src/engine/core-modules/workspace/workspace.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WschatBridgeWorkspacesController } from 'src/engine/core-modules/wschat-bridge/controllers/wschat-bridge-workspaces.controller';
import { WschatBridgeController } from 'src/engine/core-modules/wschat-bridge/controllers/wschat-bridge.controller';
import { WschatBridgeSecretGuard } from 'src/engine/core-modules/wschat-bridge/guards/wschat-bridge-secret.guard';
import { WschatBridgeMemberReadService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-read.service';
import { WschatBridgeMemberRemovalService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-removal.service';
import { WschatBridgeMemberSettingsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-settings.service';
import { WschatBridgeMemberUpsertService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-upsert.service';
import { WschatBridgeOnboardingService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-onboarding.service';
import { WschatBridgeRolesService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-roles.service';
import { WschatBridgeSubdomainService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-subdomain.service';
import { WschatBridgeUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-user.service';
import { WschatBridgeWorkspaceCreationService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-creation.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { WschatBridgeWorkspaceSettingsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-settings.service';
import { WschatBridgeWorkspaceUpdateService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-update.service';
import { WschatBridgeService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge.service';
import { RoleModule } from 'src/engine/metadata-modules/role/role.module';
import { PermissionsModule } from 'src/engine/permissions/permissions.module';
import { RoleAssignmentModule } from 'src/engine/permissions/role-assignment/role-assignment.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkspaceEntity,
      UserEntity,
      UserWorkspaceEntity,
    ]),
    TokenModule,
    WorkspaceDomainsModule,
    UserWorkspaceModule,
    AuthModule,
    WorkspaceModule,
    UserModule,
    OnboardingModule,
    SubdomainManagerModule,
    RoleModule,
    PermissionsModule,
    RoleAssignmentModule,
    WorkspaceCacheModule,
  ],
  providers: [
    WschatBridgeService,
    WschatBridgeSecretGuard,
    WschatBridgeWorkspaceLookupService,
    WschatBridgeMemberReadService,
    WschatBridgeUserService,
    WschatBridgeOnboardingService,
    WschatBridgeMemberSettingsService,
    WschatBridgeRolesService,
    WschatBridgeSubdomainService,
    WschatBridgeWorkspaceSettingsService,
    WschatBridgeWorkspaceCreationService,
    WschatBridgeWorkspaceUpdateService,
    WschatBridgeMemberUpsertService,
    WschatBridgeMemberRemovalService,
  ],
  controllers: [WschatBridgeController, WschatBridgeWorkspacesController],
})
export class WschatBridgeModule {}
