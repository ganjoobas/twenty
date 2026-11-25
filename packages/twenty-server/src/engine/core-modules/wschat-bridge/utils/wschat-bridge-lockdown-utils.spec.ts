import { PermissionFlagType } from 'twenty-shared/constants';

import { WorkspaceDiscoverability } from 'src/engine/core-modules/workspace/types/workspace-discoverability.type';
import {
  WSCHAT_BRIDGE_API_ROLE,
  WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-managed-roles.constant';
import {
  buildBridgeWorkspaceSettingsDrift,
  removeEmailFromEditableProfileFields,
} from 'src/engine/core-modules/wschat-bridge/utils/build-bridge-workspace-settings-drift.util';
import {
  findManagedRoleSettingsDrift,
  isPermissionFlagSetExact,
} from 'src/engine/core-modules/wschat-bridge/utils/find-managed-role-drift.util';
import { toBridgeRoleName } from 'src/engine/core-modules/wschat-bridge/utils/to-bridge-role-name.util';

const MEMBER_ROLE_ID = '20202020-0000-4000-8000-000000000001';

const LOCKED_DOWN_SETTINGS = {
  isPasswordAuthEnabled: false,
  isPublicInviteLinkEnabled: false,
  isGoogleAuthEnabled: false,
  isMicrosoftAuthEnabled: false,
  allowImpersonation: false,
  isTwoFactorAuthenticationEnforced: false,
  editableProfileFields: ['firstName'],
  workspaceDiscoverability: WorkspaceDiscoverability.HIDDEN,
  defaultRoleId: MEMBER_ROLE_ID,
};

describe('WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE', () => {
  it('should grant exactly the four allowed settings flags', () => {
    expect(
      [...WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE.permissionFlags].sort(),
    ).toEqual(
      [
        PermissionFlagType.AI_SETTINGS,
        PermissionFlagType.DATA_MODEL,
        PermissionFlagType.LAYOUTS,
        PermissionFlagType.WORKFLOWS,
      ].sort(),
    );
  });

  it('should never grant people, sign-in, workspace, role or API key settings', () => {
    for (const forbiddenFlag of [
      PermissionFlagType.WORKSPACE_MEMBERS,
      PermissionFlagType.SECURITY,
      PermissionFlagType.WORKSPACE,
      PermissionFlagType.ROLES,
      PermissionFlagType.API_KEYS_AND_WEBHOOKS,
      PermissionFlagType.IMPERSONATE,
      PermissionFlagType.SSO_BYPASS,
      PermissionFlagType.BILLING,
      PermissionFlagType.APPLICATIONS,
      PermissionFlagType.MARKETPLACE_APPS,
    ]) {
      expect(WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE.permissionFlags).not.toContain(
        forbiddenFlag,
      );
    }
  });
});

describe('WSCHAT_BRIDGE_API_ROLE', () => {
  it('should be an API-key-only role without settings, tools or destroy', () => {
    expect(WSCHAT_BRIDGE_API_ROLE.permissionFlags).toEqual([]);
    expect(WSCHAT_BRIDGE_API_ROLE.settings).toMatchObject({
      canUpdateAllSettings: false,
      canAccessAllTools: false,
      canDestroyAllObjectRecords: false,
      canBeAssignedToUsers: false,
      canBeAssignedToAgents: false,
      canBeAssignedToApiKeys: true,
    });
  });
});

describe('isPermissionFlagSetExact', () => {
  const expectedFlags = WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE.permissionFlags;

  it('should accept the expected flags in any order', () => {
    expect(
      isPermissionFlagSetExact([...expectedFlags].reverse(), expectedFlags),
    ).toBe(true);
  });

  it('should report a missing or an extra flag as drift', () => {
    expect(
      isPermissionFlagSetExact(expectedFlags.slice(1), expectedFlags),
    ).toBe(false);
    expect(
      isPermissionFlagSetExact(
        [...expectedFlags, PermissionFlagType.WORKSPACE_MEMBERS],
        expectedFlags,
      ),
    ).toBe(false);
  });

  it('should treat any flag on a role that must have none as drift', () => {
    expect(isPermissionFlagSetExact([], [])).toBe(true);
    expect(isPermissionFlagSetExact([PermissionFlagType.ROLES], [])).toBe(
      false,
    );
  });
});

describe('findManagedRoleSettingsDrift', () => {
  it('should find nothing on a role with the expected switches', () => {
    expect(
      findManagedRoleSettingsDrift(
        { ...WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE.settings },
        WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE.settings,
      ),
    ).toEqual([]);
  });

  it('should name the switches that drifted', () => {
    expect(
      findManagedRoleSettingsDrift(
        {
          ...WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE.settings,
          canUpdateAllSettings: true,
          canBeAssignedToApiKeys: true,
        },
        WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE.settings,
      ),
    ).toEqual(['canUpdateAllSettings', 'canBeAssignedToApiKeys']);
  });
});

describe('removeEmailFromEditableProfileFields', () => {
  it('should drop email and keep the other fields', () => {
    expect(
      removeEmailFromEditableProfileFields([
        'email',
        'profilePicture',
        'firstName',
        'lastName',
      ]),
    ).toEqual(['profilePicture', 'firstName', 'lastName']);
  });

  it('should keep null, which already means nothing is editable', () => {
    expect(removeEmailFromEditableProfileFields(null)).toBeNull();
  });
});

describe('buildBridgeWorkspaceSettingsDrift', () => {
  it('should list every owned setting of a fresh workspace', () => {
    expect(
      buildBridgeWorkspaceSettingsDrift(
        {
          isPasswordAuthEnabled: true,
          isPublicInviteLinkEnabled: true,
          isGoogleAuthEnabled: true,
          isMicrosoftAuthEnabled: true,
          allowImpersonation: true,
          isTwoFactorAuthenticationEnforced: true,
          editableProfileFields: ['email', 'firstName'],
          workspaceDiscoverability: WorkspaceDiscoverability.PUBLIC,
          defaultRoleId: 'another-role-id',
        },
        { memberRoleId: MEMBER_ROLE_ID },
      ),
    ).toEqual(LOCKED_DOWN_SETTINGS);
  });

  it('should be empty for a workspace already locked down', () => {
    expect(
      buildBridgeWorkspaceSettingsDrift(LOCKED_DOWN_SETTINGS, {
        memberRoleId: MEMBER_ROLE_ID,
      }),
    ).toEqual({});
  });
});

describe('toBridgeRoleName for the company-admin role', () => {
  it('should read the company-admin role back as admin whatever its label', () => {
    expect(
      toBridgeRoleName({
        universalIdentifier:
          WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE.universalIdentifier,
        label: 'Администратор компании',
      }),
    ).toBe('admin');
  });
});
