export class WschatBridgeServiceKeyDTO {
  id: string;

  // Shown once: Twenty stores only the key id, the token cannot be read back
  token: string;

  expiresAt: string;
}
