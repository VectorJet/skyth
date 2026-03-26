export interface DeviceNode {
  id: string;
  channel: string;
  sender_id: string;
  token: string;
  mfa_verified: boolean;
  mfa_verified_at?: string;
  trusted_at: string;
  metadata: Record<string, unknown>;
}

export interface PendingPairingCode {
  code: string;
  channel: string;
  created_at: string;
  expires_at: string;
  used: boolean;
}

export interface DeviceIdentityToken {
  version: 1;
  kind: "device_identity";
  token_id: string;
  created_at: string;
  salt_bits: number;
  salt_b64: string;
  kdf: {
    algorithm: "argon2id";
    hash: string;
    memory_cost: number;
    time_cost: number;
    parallelism: number;
    hash_length: number;
  };
  encryption: {
    algorithm: "aes-256-gcm";
    key_derivation: string;
    iv_b64: string;
    auth_tag_b64: string;
    ciphertext_b64: string;
  };
  nodes: DeviceNode[];
}

export interface DeviceNodesStore {
  version: 1;
  nodes: DeviceNode[];
}

export interface PairingCodesStore {
  version: 1;
  codes: PendingPairingCode[];
}