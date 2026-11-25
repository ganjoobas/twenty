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

  // Reported only; nothing is revoked
  activeApiKeys: number;

  // SSO lives in enterprise-licensed files the bridge does not import
  sso: 'not checked';
}
