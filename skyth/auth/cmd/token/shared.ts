import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import * as argon2 from "argon2";

const DEVICE_DIR = "device";
const IDENTITY_DIR = "identity";
const TOKEN_FILE = "token";
const NODES_FILE = "nodes.json";
const PAIRING_CODES_FILE = "pairing_codes.json";

const ARGON2_MEMORY_COST = 19456;
const ARGON2_TIME_COST = 2;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32;
const SALT_BYTES = 4;
const ARGON2_SALT_BYTES = 16;
const IV_BYTES = 12;
const TOKEN_BYTES = 32;
const PAIRING_CODE_LENGTH = 16;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
  salt_bits: 32;
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
    key_derivation: "sha256(argon2id_hash)";
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

function homePath(): string {
  return process.env.HOME || homedir();
}

function authRoot(overrideAuthDir?: string): string {
  return overrideAuthDir || join(homePath(), ".skyth", "auth");
}

function deviceRoot(overrideAuthDir?: string): string {
  return join(authRoot(overrideAuthDir), DEVICE_DIR);
}

function identityDir(overrideAuthDir?: string): string {
  return join(deviceRoot(overrideAuthDir), IDENTITY_DIR);
}

function tokenPath(overrideAuthDir?: string): string {
  return join(identityDir(overrideAuthDir), TOKEN_FILE);
}

function nodesPath(overrideAuthDir?: string): string {
  return join(identityDir(overrideAuthDir), NODES_FILE);
}

export function ensureDevicePaths(overrideAuthDir?: string): void {
  const root = deviceRoot(overrideAuthDir);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  try {
    chmodSync(root, 0o700);
  } catch {
    // Best effort.
  }

  const identity = identityDir(overrideAuthDir);
  mkdirSync(identity, { recursive: true, mode: 0o700 });
  try {
    chmodSync(identity, 0o700);
  } catch {
    // Best effort.
  }
}

export function hasDeviceToken(overrideAuthDir?: string): boolean {
  const path = tokenPath(overrideAuthDir);
  return existsSync(path);
}

export function generateToken(): string {
  const bytes = randomBytes(TOKEN_BYTES);
  return bytes.toString("base64url");
}

export function generateTokenId(): string {
  return randomBytes(8).toString("hex");
}

export function generateNodeId(): string {
  return randomBytes(8).toString("hex");
}

export function generateNodeToken(): string {
  const bytes = randomBytes(PAIRING_CODE_LENGTH);
  let token = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    token += CODE_CHARS[bytes[i]! % CODE_CHARS.length]!;
  }
  return token;
}

function digestNodeToken(token: string): string {
  const normalized = String(token ?? "").trim().toUpperCase();
  return `sha256:${createHash("sha256").update(normalized, "utf-8").digest("hex")}`;
}

export function secureCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf-8");
  const bBuf = Buffer.from(b, "utf-8");

  if (aBuf.length !== bBuf.length) {
    // Prevent timing leaks by always running timingSafeEqual
    // even when lengths differ. This ensures we don't bail early.
    const paddedB = Buffer.alloc(aBuf.length);
    bBuf.copy(paddedB);
    timingSafeEqual(aBuf, paddedB);
    return false;
  }

  return timingSafeEqual(aBuf, bBuf);
}

function matchesNodeToken(stored: string, candidate: string): boolean {
  const normalizedStored = String(stored ?? "").trim();
  const normalizedCandidate = String(candidate ?? "").trim().toUpperCase();
  if (!normalizedStored || !normalizedCandidate) return false;
  if (secureCompare(normalizedStored, normalizedCandidate)) return true;
  if (normalizedStored.startsWith("sha256:")) {
    return secureCompare(normalizedStored, digestNodeToken(normalizedCandidate));
  }
  // Backward compatibility for legacy plaintext token records.
  return secureCompare(normalizedStored.toUpperCase(), normalizedCandidate);
}

export async function createDeviceToken(
  password: string,
  overrideAuthDir?: string,
): Promise<{ path: string; token: DeviceIdentityToken }> {
  const trimmed = password.trim();
  if (!trimmed) {
    throw new Error("Password cannot be empty.");
  }

  ensureDevicePaths(overrideAuthDir);

  const token = generateToken();
  const tokenId = generateTokenId();
  const saltSeed = randomBytes(SALT_BYTES);
  const argonSalt = createHash("sha256").update(saltSeed).digest().subarray(0, ARGON2_SALT_BYTES);

  const argonHash = await argon2.hash(trimmed, {
    type: argon2.argon2id,
    salt: argonSalt,
    memoryCost: ARGON2_MEMORY_COST,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM,
    hashLength: ARGON2_HASH_LENGTH,
  });

  const key = createHash("sha256").update(argonHash, "utf-8").digest();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const record: DeviceIdentityToken = {
    version: 1,
    kind: "device_identity",
    token_id: tokenId,
    created_at: new Date().toISOString(),
    salt_bits: 32,
    salt_b64: saltSeed.toString("base64"),
    kdf: {
      algorithm: "argon2id",
      hash: argonHash,
      memory_cost: ARGON2_MEMORY_COST,
      time_cost: ARGON2_TIME_COST,
      parallelism: ARGON2_PARALLELISM,
      hash_length: ARGON2_HASH_LENGTH,
    },
    encryption: {
      algorithm: "aes-256-gcm",
      key_derivation: "sha256(argon2id_hash)",
      iv_b64: iv.toString("base64"),
      auth_tag_b64: authTag.toString("base64"),
      ciphertext_b64: ciphertext.toString("base64"),
    },
    nodes: [],
  };

  const path = tokenPath(overrideAuthDir);
  writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort.
  }

  return { path, token: record };
}

export async function decryptDeviceToken(
  password: string,
  overrideAuthDir?: string,
): Promise<string | null> {
  const trimmed = password.trim();
  if (!trimmed) return null;

  const path = tokenPath(overrideAuthDir);
  if (!existsSync(path)) return null;

  let record: DeviceIdentityToken;
  try {
    const raw = readFileSync(path, "utf-8");
    record = JSON.parse(raw) as DeviceIdentityToken;
  } catch {
    return null;
  }

  if (record.kind !== "device_identity") return null;

  try {
    const hash = record.kdf?.hash;
    if (!hash) return null;

    if (!(await argon2.verify(hash, trimmed))) return null;

    const key = createHash("sha256").update(hash, "utf-8").digest();
    const iv = Buffer.from(record.encryption.iv_b64, "base64");
    const authTag = Buffer.from(record.encryption.auth_tag_b64, "base64");
    const ciphertext = Buffer.from(record.encryption.ciphertext_b64, "base64");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");

    return plain;
  } catch {
    return null;
  }
}

export function getDeviceTokenInfo(overrideAuthDir?: string): DeviceIdentityToken | null {
  const path = tokenPath(overrideAuthDir);
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, "utf-8");
    const record = JSON.parse(raw) as DeviceIdentityToken;
    if (record.kind !== "device_identity") return null;
    return record;
  } catch {
    return null;
  }
}

export async function changeDeviceToken(
  newPassword: string,
  overrideAuthDir?: string,
): Promise<{ path: string; token: DeviceIdentityToken }> {
  const oldRecord = getDeviceTokenInfo(overrideAuthDir);
  if (!oldRecord) {
    throw new Error("No device token exists. Create one first.");
  }

  const newToken = generateToken();
  const tokenId = generateTokenId();
  const saltSeed = randomBytes(SALT_BYTES);
  const argonSalt = createHash("sha256").update(saltSeed).digest().subarray(0, ARGON2_SALT_BYTES);

  const argonHash = await argon2.hash(newPassword, {
    type: argon2.argon2id,
    salt: argonSalt,
    memoryCost: ARGON2_MEMORY_COST,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM,
    hashLength: ARGON2_HASH_LENGTH,
  });

  const key = createHash("sha256").update(argonHash, "utf-8").digest();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(newToken, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const record: DeviceIdentityToken = {
    version: 1,
    kind: "device_identity",
    token_id: tokenId,
    created_at: new Date().toISOString(),
    salt_bits: 32,
    salt_b64: saltSeed.toString("base64"),
    kdf: {
      algorithm: "argon2id",
      hash: argonHash,
      memory_cost: ARGON2_MEMORY_COST,
      time_cost: ARGON2_TIME_COST,
      parallelism: ARGON2_PARALLELISM,
      hash_length: ARGON2_HASH_LENGTH,
    },
    encryption: {
      algorithm: "aes-256-gcm",
      key_derivation: "sha256(argon2id_hash)",
      iv_b64: iv.toString("base64"),
      auth_tag_b64: authTag.toString("base64"),
      ciphertext_b64: ciphertext.toString("base64"),
    },
    nodes: oldRecord.nodes,
  };

  const path = tokenPath(overrideAuthDir);
  writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 });

  return { path, token: record };
}

export async function rotateDeviceToken(
  password: string,
  overrideAuthDir?: string,
): Promise<{ path: string; token: DeviceIdentityToken }> {
  return changeDeviceToken(password, overrideAuthDir);
}

export function loadNodes(overrideAuthDir?: string): DeviceNodesStore {
  const path = nodesPath(overrideAuthDir);
  if (!existsSync(path)) {
    return { version: 1, nodes: [] };
  }
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as DeviceNodesStore;
  } catch {
    return { version: 1, nodes: [] };
  }
}

export function saveNodes(store: DeviceNodesStore, overrideAuthDir?: string): void {
  ensureDevicePaths(overrideAuthDir);
  const path = nodesPath(overrideAuthDir);
  writeFileSync(path, JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function addNode(
  channel: string,
  senderId: string,
  metadata: Record<string, unknown> = {},
  overrideAuthDir?: string,
  providedToken?: string,
): DeviceNode {
  const store = loadNodes(overrideAuthDir);
  
  const now = new Date().toISOString();
  const rawToken = providedToken || generateNodeToken();
  const node: DeviceNode = {
    id: generateNodeId(),
    channel,
    sender_id: senderId,
    token: digestNodeToken(rawToken),
    mfa_verified: true,
    mfa_verified_at: now,
    trusted_at: now,
    metadata,
  };

  // Replace existing node for the same channel and senderId
  const existingIdx = store.nodes.findIndex((n) => n.channel === channel && n.sender_id === senderId);
  if (existingIdx >= 0) {
    store.nodes[existingIdx] = node;
  } else {
    store.nodes.push(node);
  }
  
  saveNodes(store, overrideAuthDir);

  return node;
}

export function listNodes(overrideAuthDir?: string): DeviceNode[] {
  const store = loadNodes(overrideAuthDir);
  return store.nodes;
}

export function removeNode(nodeId: string, overrideAuthDir?: string): boolean {
  const store = loadNodes(overrideAuthDir);
  const initialLength = store.nodes.length;
  store.nodes = store.nodes.filter((n) => n.id !== nodeId);
  
  if (store.nodes.length < initialLength) {
    saveNodes(store, overrideAuthDir);
    return true;
  }
  return false;
}

export function verifyNodeToken(nodeId: string, token: string, overrideAuthDir?: string): boolean {
  const store = loadNodes(overrideAuthDir);
  const node = store.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  return matchesNodeToken(node.token, token);
}

export function getNodeByToken(token: string, overrideAuthDir?: string): DeviceNode | undefined {
  const normalized = String(token ?? "").trim();
  if (!normalized) return undefined;
  const store = loadNodes(overrideAuthDir);
  return store.nodes.find((n) => n.mfa_verified === true && matchesNodeToken(n.token, normalized));
}

export function isNodeTrusted(channel: string, senderId: string, overrideAuthDir?: string): boolean {
  const store = loadNodes(overrideAuthDir);
  return store.nodes.some(
    (n) => n.channel === channel && n.sender_id === senderId && n.mfa_verified === true,
  );
}

export function getNodeForSender(channel: string, senderId: string, overrideAuthDir?: string): DeviceNode | undefined {
  const store = loadNodes(overrideAuthDir);
  return store.nodes.find((n) => n.channel === channel && n.sender_id === senderId);
}
