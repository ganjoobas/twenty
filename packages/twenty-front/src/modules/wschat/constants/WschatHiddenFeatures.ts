type WschatHiddenFeature =
  | 'twoFactorAuthentication'
  | 'aiUsage'
  | 'signOut'
  | 'createWorkspace'
  | 'deleteAccount';

// The CRM is used only inside a WSChat frame, so these upstream features are hidden; see WSCHAT.md
export const WSCHAT_HIDDEN_FEATURES: Record<WschatHiddenFeature, boolean> = {
  // People sign in only through WSChat, which has its own second factor
  twoFactorAuthentication: true,
  // A paid upstream feature that is not enabled here; WSChat meters AI itself
  aiUsage: true,
  // Leaving is done in WSChat; the CRM sign-in screen is not used
  signOut: true,
  // Workspaces are created only by WSChat through the bridge
  createWorkspace: true,
  // People are managed by WSChat: self-deletion would drop the person from
  // every company's CRM, and the next sync would recreate them
  deleteAccount: true,
};
