export class WschatBridgeMemberDTO {
  email: string;

  firstName: string;

  lastName: string;

  // 'admin' | 'member' for the standard roles, the role label for a custom role, null when none is assigned
  role: string | null;

  isDisabled: boolean;
}

export class WschatBridgeUpsertedMemberDTO extends WschatBridgeMemberDTO {
  created: boolean;
}

export class WschatBridgeRemovedMemberDTO {
  removed: boolean;
}
