import { WorkspaceDiscoverability } from 'src/engine/core-modules/workspace/types/workspace-discoverability.type';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

export type WschatBridgeOwnedWorkspaceSettings = Pick<
  WorkspaceEntity,
  | 'isPasswordAuthEnabled'
  | 'isPublicInviteLinkEnabled'
  | 'isGoogleAuthEnabled'
  | 'isMicrosoftAuthEnabled'
  | 'allowImpersonation'
  | 'isTwoFactorAuthenticationEnforced'
  | 'editableProfileFields'
  | 'workspaceDiscoverability'
  | 'defaultRoleId'
>;

// People are identified by e-mail in WSChat, so members must not change it; null already means "nothing editable"
export const removeEmailFromEditableProfileFields = (
  editableProfileFields: string[] | null,
): string[] | null =>
  editableProfileFields === null
    ? null
    : editableProfileFields.filter((field) => field !== 'email');

// Only the settings that differ from what the bridge enforces, so the update writes (and reports) just the drift
export const buildBridgeWorkspaceSettingsDrift = (
  workspace: WschatBridgeOwnedWorkspaceSettings,
  { memberRoleId }: { memberRoleId: string },
): Partial<WschatBridgeOwnedWorkspaceSettings> => {
  const drift: Partial<WschatBridgeOwnedWorkspaceSettings> = {};

  for (const field of [
    'isPasswordAuthEnabled',
    'isPublicInviteLinkEnabled',
    'isGoogleAuthEnabled',
    'isMicrosoftAuthEnabled',
    'allowImpersonation',
    'isTwoFactorAuthenticationEnforced',
  ] as const) {
    if (workspace[field] !== false) {
      drift[field] = false;
    }
  }

  if (workspace.editableProfileFields?.includes('email') === true) {
    drift.editableProfileFields = removeEmailFromEditableProfileFields(
      workspace.editableProfileFields,
    );
  }

  // Bridge workspaces are reached only through their own URL, never through the root-domain picker
  if (workspace.workspaceDiscoverability !== WorkspaceDiscoverability.HIDDEN) {
    drift.workspaceDiscoverability = WorkspaceDiscoverability.HIDDEN;
  }

  if (workspace.defaultRoleId !== memberRoleId) {
    drift.defaultRoleId = memberRoleId;
  }

  return drift;
};
