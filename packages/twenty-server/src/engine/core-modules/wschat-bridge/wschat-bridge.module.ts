import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApiPath } from 'twenty-shared/types';

import { ApiKeyModule } from 'src/engine/core-modules/api-key/api-key.module';
import { ApplicationAuthorizationModule } from 'src/engine/core-modules/application/application-authorization/application-authorization.module';
import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { AppTokenEntity } from 'src/engine/core-modules/app-token/app-token.entity';
import { ApprovedAccessDomainModule } from 'src/engine/core-modules/approved-access-domain/approved-access-domain.module';
import { AuthModule } from 'src/engine/core-modules/auth/auth.module';
import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { SubdomainManagerModule } from 'src/engine/core-modules/domain/subdomain-manager/subdomain-manager.module';
import { WorkspaceDomainsModule } from 'src/engine/core-modules/domain/workspace-domains/workspace-domains.module';
import { KeyValuePairModule } from 'src/engine/core-modules/key-value-pair/key-value-pair.module';
import { OnboardingModule } from 'src/engine/core-modules/onboarding/onboarding.module';
import { TwoFactorAuthenticationMethodEntity } from 'src/engine/core-modules/two-factor-authentication/entities/two-factor-authentication-method.entity';
import { TwoFactorAuthenticationBackupCodeService } from 'src/engine/core-modules/two-factor-authentication/services/two-factor-authentication-backup-code.service';
import { UserSessionModule } from 'src/engine/core-modules/user-session/user-session.module';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserWorkspaceModule } from 'src/engine/core-modules/user-workspace/user-workspace.module';
import { UserModule } from 'src/engine/core-modules/user/user.module';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceInvitationModule } from 'src/engine/core-modules/workspace-invitation/workspace-invitation.module';
import { WorkspaceModule } from 'src/engine/core-modules/workspace/workspace.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WschatBridgeApiKeysController } from 'src/engine/core-modules/wschat-bridge/controllers/wschat-bridge-api-keys.controller';
import { WschatBridgeWorkspacesController } from 'src/engine/core-modules/wschat-bridge/controllers/wschat-bridge-workspaces.controller';
import { WschatBridgeController } from 'src/engine/core-modules/wschat-bridge/controllers/wschat-bridge.controller';
import { WschatBridgeAuthorizeAppGuard } from 'src/engine/core-modules/wschat-bridge/guards/wschat-bridge-authorize-app.guard';
import { WschatBridgeSecretGuard } from 'src/engine/core-modules/wschat-bridge/guards/wschat-bridge-secret.guard';
import { WschatBridgeServiceUserConfiguredGuard } from 'src/engine/core-modules/wschat-bridge/guards/wschat-bridge-service-user-configured.guard';
import { WschatBridgeAssistantsGateMiddleware } from 'src/engine/core-modules/wschat-bridge/middlewares/wschat-bridge-assistants-gate.middleware';
import { WschatBridgeAssistantsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-assistants.service';
import { WschatBridgeApiKeysService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-api-keys.service';
import { WschatBridgeManagedRoleService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-managed-role.service';
import { WschatBridgeMemberReadService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-read.service';
import { WschatBridgeMemberRemovalService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-removal.service';
import { WschatBridgeMemberSettingsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-settings.service';
import { WschatBridgeMemberTwoFactorService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-two-factor.service';
import { WschatBridgeMemberUpsertService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-upsert.service';
import { WschatBridgeMembershipService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-membership.service';
import { WschatBridgeOnboardingService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-onboarding.service';
import { WschatBridgeRolesService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-roles.service';
import { WschatBridgeDictionariesService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-dictionaries.service';
import { WschatBridgeDataModelService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-data-model.service';
import { WschatBridgeStarterIndexViewsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-starter-index-views.service';
import { WschatBridgeStarterLayoutService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-starter-layout.service';
import { WschatBridgeStarterViewsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-starter-views.service';
import { WschatBridgeServiceUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-service-user.service';
import { WschatBridgeSubdomainService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-subdomain.service';
import { WschatBridgeUserService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-user.service';
import { WschatBridgeWorkspaceCreationService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-creation.service';
import { WschatBridgeWorkspaceEnforcementService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-enforcement.service';
import { WschatBridgeWorkspaceLookupService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-lookup.service';
import { WschatBridgeWorkspaceSettingsService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-settings.service';
import { WschatBridgeWorkspaceUpdateService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-workspace-update.service';
import { WschatBridgeService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge.service';
import { RolePermissionFlagModule } from 'src/engine/metadata-modules/role-permission-flag/role-permission-flag.module';
import { ObjectMetadataModule } from 'src/engine/metadata-modules/object-metadata/object-metadata.module';
import { FieldMetadataModule } from 'src/engine/metadata-modules/field-metadata/field-metadata.module';
import { WebhookModule } from 'src/engine/metadata-modules/webhook/webhook.module';
import { RoleModule } from 'src/engine/metadata-modules/role/role.module';
import { PermissionsModule } from 'src/engine/permissions/permissions.module';
import { RoleAssignmentModule } from 'src/engine/permissions/role-assignment/role-assignment.module';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { WorkspaceMigrationModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkspaceEntity,
      UserEntity,
      UserWorkspaceEntity,
      AppTokenEntity,
      TwoFactorAuthenticationMethodEntity,
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
    ApplicationModule,
    RolePermissionFlagModule,
    WorkspaceInvitationModule,
    ApprovedAccessDomainModule,
    ApiKeyModule,
    UserSessionModule,
    WebhookModule,
    FieldMetadataModule,
    ObjectMetadataModule,
    KeyValuePairModule,
    ApplicationAuthorizationModule,
    WorkspaceMigrationModule,
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
    WschatBridgeServiceUserService,
    WschatBridgeServiceUserConfiguredGuard,
    WschatBridgeManagedRoleService,
    WschatBridgeMembershipService,
    WschatBridgeWorkspaceEnforcementService,
    WschatBridgeApiKeysService,
    WschatBridgeMemberTwoFactorService,
    WschatBridgeDataModelService,
    WschatBridgeDictionariesService,
    WschatBridgeAssistantsService,
    WschatBridgeStarterLayoutService,
    WschatBridgeStarterViewsService,
    WschatBridgeStarterIndexViewsService,
    { provide: APP_GUARD, useClass: WschatBridgeAuthorizeAppGuard },
    // Not exported by TwoFactorAuthenticationModule; both need only core repositories, so they are provided here
    TwoFactorAuthenticationBackupCodeService,
    provideWorkspaceScopedRepository(TwoFactorAuthenticationMethodEntity),
  ],
  controllers: [
    WschatBridgeController,
    WschatBridgeWorkspacesController,
    WschatBridgeApiKeysController,
  ],
})
export class WschatBridgeModule implements NestModule {
  // External assistants: README, "External assistants"
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(WschatBridgeAssistantsGateMiddleware)
      .forRoutes(
        { path: ApiPath.Mcp, method: RequestMethod.ALL },
        { path: `${ApiPath.Mcp}/*path`, method: RequestMethod.ALL },
        { path: `${ApiPath.OAuth}/*path`, method: RequestMethod.ALL },
        { path: `${ApiPath.WellKnown}/*path`, method: RequestMethod.ALL },
      );
  }
}
