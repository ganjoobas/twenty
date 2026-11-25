import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

export type WschatBridgeOwnedWorkspaceSettings = Pick<
  WorkspaceEntity,
  | 'isPasswordAuthEnabled'
  | 'isPublicInviteLinkEnabled'
  | 'isGoogleAuthEnabled'
  | 'isMicrosoftAuthEnabled'
  | 'allowImpersonation'
  | 'editableProfileFields'
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
): Partial<WschatBridgeOwnedWorkspaceSettings> => {
  const drift: Partial<WschatBridgeOwnedWorkspaceSettings> = {};

  for (const field of [
    'isPasswordAuthEnabled',
    'isPublicInviteLinkEnabled',
    'isGoogleAuthEnabled',
    'isMicrosoftAuthEnabled',
    'allowImpersonation',
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

  return drift;
};
