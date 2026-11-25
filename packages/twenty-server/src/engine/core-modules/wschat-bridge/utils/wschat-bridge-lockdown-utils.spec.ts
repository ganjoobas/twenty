import { PermissionFlagType } from 'twenty-shared/constants';

import {
  WSCHAT_BRIDGE_COMPANY_ADMIN_PERMISSION_FLAGS,
  WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_SETTINGS,
  WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-company-admin-role.constant';
import {
  buildBridgeWorkspaceSettingsDrift,
  removeEmailFromEditableProfileFields,
} from 'src/engine/core-modules/wschat-bridge/utils/build-bridge-workspace-settings-drift.util';
import {
  findCompanyAdminRoleSettingsDrift,
  isCompanyAdminPermissionFlagSetExact,
} from 'src/engine/core-modules/wschat-bridge/utils/find-company-admin-role-drift.util';
import { toBridgeRoleName } from 'src/engine/core-modules/wschat-bridge/utils/to-bridge-role-name.util';

describe('WSCHAT_BRIDGE_COMPANY_ADMIN_PERMISSION_FLAGS', () => {
  it('should grant exactly the four allowed settings flags', () => {
    expect([...WSCHAT_BRIDGE_COMPANY_ADMIN_PERMISSION_FLAGS].sort()).toEqual(
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
      expect(WSCHAT_BRIDGE_COMPANY_ADMIN_PERMISSION_FLAGS).not.toContain(
        forbiddenFlag,
      );
    }
  });
});

describe('isCompanyAdminPermissionFlagSetExact', () => {
  it('should accept the allow-list in any order', () => {
    expect(
      isCompanyAdminPermissionFlagSetExact(
        [...WSCHAT_BRIDGE_COMPANY_ADMIN_PERMISSION_FLAGS].reverse(),
      ),
    ).toBe(true);
  });

  it('should report a missing or an extra flag as drift', () => {
    expect(
      isCompanyAdminPermissionFlagSetExact(
        WSCHAT_BRIDGE_COMPANY_ADMIN_PERMISSION_FLAGS.slice(1),
      ),
    ).toBe(false);
    expect(
      isCompanyAdminPermissionFlagSetExact([
        ...WSCHAT_BRIDGE_COMPANY_ADMIN_PERMISSION_FLAGS,
        PermissionFlagType.WORKSPACE_MEMBERS,
      ]),
    ).toBe(false);
  });
});

describe('findCompanyAdminRoleSettingsDrift', () => {
  it('should find nothing on a role with the expected switches', () => {
    expect(
      findCompanyAdminRoleSettingsDrift({
        ...WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_SETTINGS,
      }),
    ).toEqual([]);
  });

  it('should name the switches that drifted', () => {
    expect(
      findCompanyAdminRoleSettingsDrift({
        ...WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_SETTINGS,
        canUpdateAllSettings: true,
        canBeAssignedToApiKeys: true,
      }),
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
      buildBridgeWorkspaceSettingsDrift({
        isPasswordAuthEnabled: true,
        isPublicInviteLinkEnabled: true,
        isGoogleAuthEnabled: true,
        isMicrosoftAuthEnabled: true,
        allowImpersonation: true,
        editableProfileFields: ['email', 'firstName'],
      }),
    ).toEqual({
      isPasswordAuthEnabled: false,
      isPublicInviteLinkEnabled: false,
      isGoogleAuthEnabled: false,
      isMicrosoftAuthEnabled: false,
      allowImpersonation: false,
      editableProfileFields: ['firstName'],
    });
  });

  it('should be empty for a workspace already locked down', () => {
    expect(
      buildBridgeWorkspaceSettingsDrift({
        isPasswordAuthEnabled: false,
        isPublicInviteLinkEnabled: false,
        isGoogleAuthEnabled: false,
        isMicrosoftAuthEnabled: false,
        allowImpersonation: false,
        editableProfileFields: ['firstName'],
      }),
    ).toEqual({});
  });
});

describe('toBridgeRoleName for the company-admin role', () => {
  it('should read the company-admin role back as admin whatever its label', () => {
    expect(
      toBridgeRoleName({
        universalIdentifier:
          WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
        label: 'Администратор компании',
      }),
    ).toBe('admin');
  });
});
