export class WschatBridgeEnforceReportDTO {
  serviceUserAdded: boolean;

  adminRoleCreated: boolean;

  // Label, role switches or settings flags had drifted and were re-applied
  adminRoleFlagsFixed: boolean;

  // Humans moved from the standard Admin role to the company-admin role
  convertedAdmins: number;

  // Humans on a role that is neither company admin nor Member; left as they are
  unexpectedRoles: number;

  settingsFixed: string[];

  invitationsDeleted: number;

  approvedDomainsDeleted: number;

  // Stored iframe camera/microphone grants; reported only, upstream has no service method to clear them
  iframeMediaPermissions: number;

  // Active keys without the API role, revoked: keys are issued only through the bridge
  foreignApiKeysRevoked: number;

  // Active keys holding the API role
  activeApiKeys: number;

  // WSChat's own key (name "WSChat") exists and is not revoked
  serviceKeyActive: boolean;

  // Reported only; nothing is deleted
  webhooks: number;

  // SSO lives in enterprise-licensed files the bridge does not import
  sso: 'not checked';

  // WSChat objects ("wschatCall") and fields ("person.wschatPhones") created by this run
  dataModelCreated: string[];

  // Ours, but deactivated or labelled other than the requested locale: reactivated / relabelled
  dataModelRepaired: string[];

  // Same name but not ours or another shape, or its object is missing: left untouched
  dataModelConflicts: string[];
}
