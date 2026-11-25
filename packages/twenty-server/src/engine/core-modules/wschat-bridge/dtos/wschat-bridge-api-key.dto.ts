export class WschatBridgeApiKeyDTO {
  id: string;

  name: string;

  expiresAt: string;

  createdAt: string;
}

export class WschatBridgeCreatedApiKeyDTO {
  id: string;

  name: string;

  expiresAt: string;

  // Shown once: Twenty stores only the key id, the token cannot be read back
  token: string;
}

export class WschatBridgeRevokedApiKeyDTO {
  revoked: boolean;
}
