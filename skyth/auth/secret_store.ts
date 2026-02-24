import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const MASTER_KEY_FILENAME = "master.key";
const MASTER_KEY_BYTES = 32;
const SALT_BYTES = 4;
const IV_BYTES = 12;

export const REDACTED_BLOCK = "[redacted]";

export const PROVIDER_SECRET_PATHS = ["api_key"] as const;
export const TOOL_SECRET_PATHS = ["web.search.api_key"] as const;
export const CHANNEL_SECRET_PATHS: Record<string, string[]> = {
  whatsapp: ["bridge_token"],
  telegram: ["token"],
  discord: ["token"],
  feishu: ["app_secret", "encrypt_key", "verification_token"],
  mochat: ["claw_token"],
  dingtalk: ["client_secret"],
  slack: ["bot_token", "app_token"],
  qq: ["secret"],
  email: ["imap_password", "smtp_password"],
};

interface SecretRecord {
  version: 1;
  kind: "secret";
  created_at: string;
  scope: string;
  subject: string;
  key_path: string;
  salt_bits: 32;
  salt_b64: string;
  hash: {
    algorithm: "sha256";
    value_hex: string;
  };
  encryption: {
    algorithm: "aes-256-gcm";
    iv_b64: string;
    auth_tag_b64: string;
    ciphertext_b64: string;
  };
}

function homePath(): string {
  return process.env.HOME || homedir();
}

function authRoot(overrideAuthDir?: string): string {
  return overrideAuthDir || join(homePath(), ".skyth", "auth");
}

function sanitizeSubject(subject: string): string {
  const safe = subject.replace(/[^a-zA-Z0-9._-]/g, "_").trim();
  return safe || "default";
}

function ensurePrivatePath(path: string, mode: number): void {
  mkdirSync(path, { recursive: true, mode });
  try {
    chmodSync(path, mode);
  } catch {
    // Best effort.
  }
}

function ensureRootPaths(overrideAuthDir?: string): void {
  const root = authRoot(overrideAuthDir);
  ensurePrivatePath(root, 0o700);
  ensurePrivatePath(join(root, "secrets"), 0o700);
}

function masterKeyPath(overrideAuthDir?: string): string {
  return join(authRoot(overrideAuthDir), MASTER_KEY_FILENAME);
}

function getOrCreateMasterKey(overrideAuthDir?: string): Buffer {
  ensureRootPaths(overrideAuthDir);
  const path = masterKeyPath(overrideAuthDir);

  if (existsSync(path)) {
    const current = readFileSync(path);
    if (current.length === MASTER_KEY_BYTES) return current;
  }

  const next = randomBytes(MASTER_KEY_BYTES);
  writeFileSync(path, next, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort.
  }
  return next;
}

function secretFilePath(scope: string, subject: string, overrideAuthDir?: string): string {
  const dir = join(authRoot(overrideAuthDir), "secrets", scope);
  ensurePrivatePath(dir, 0o700);
  return join(dir, `${sanitizeSubject(subject)}.jsonl`);
}

function computeHashHex(salt: Buffer, value: string): string {
  return createHash("sha256")
    .update(salt)
    .update(value, "utf-8")
    .digest("hex");
}

export function isRedactedBlock(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase().startsWith(REDACTED_BLOCK);
}

export function persistSecretValue(params: {
  scope: string;
  subject: string;
  keyPath: string;
  value: string;
  authDir?: string;
}): void {
  const plain = params.value.trim();
  if (!plain || isRedactedBlock(plain)) return;

  const masterKey = getOrCreateMasterKey(params.authDir);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const record: SecretRecord = {
    version: 1,
    kind: "secret",
    created_at: new Date().toISOString(),
    scope: params.scope,
    subject: params.subject,
    key_path: params.keyPath,
    salt_bits: 32,
    salt_b64: salt.toString("base64"),
    hash: {
      algorithm: "sha256",
      value_hex: computeHashHex(salt, plain),
    },
    encryption: {
      algorithm: "aes-256-gcm",
      iv_b64: iv.toString("base64"),
      auth_tag_b64: tag.toString("base64"),
      ciphertext_b64: ciphertext.toString("base64"),
    },
  };

  const path = secretFilePath(params.scope, params.subject, params.authDir);
  appendFileSync(path, `${JSON.stringify(record)}\n`, { encoding: "utf-8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort.
  }
}

export function readLatestSecretValue(params: {
  scope: string;
  subject: string;
  keyPath: string;
  authDir?: string;
}): string | undefined {
  const path = secretFilePath(params.scope, params.subject, params.authDir);
  if (!existsSync(path)) return undefined;

  const masterKeyPathValue = masterKeyPath(params.authDir);
  if (!existsSync(masterKeyPathValue)) return undefined;
  const masterKey = readFileSync(masterKeyPathValue);
  if (masterKey.length !== MASTER_KEY_BYTES) return undefined;

  let lines: string[] = [];
  try {
    lines = readFileSync(path, "utf-8").split("\n").filter((line) => line.trim().length > 0);
  } catch {
    return undefined;
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let record: SecretRecord | undefined;
    try {
      record = JSON.parse(lines[i]!) as SecretRecord;
    } catch {
      continue;
    }
    if (!record || record.kind !== "secret") continue;
    if (record.scope !== params.scope || record.subject !== params.subject || record.key_path !== params.keyPath) continue;
    if (record.encryption?.algorithm !== "aes-256-gcm") continue;
    if (record.hash?.algorithm !== "sha256") continue;

    try {
      const iv = Buffer.from(record.encryption.iv_b64, "base64");
      const authTag = Buffer.from(record.encryption.auth_tag_b64, "base64");
      const ciphertext = Buffer.from(record.encryption.ciphertext_b64, "base64");
      const decipher = createDecipheriv("aes-256-gcm", masterKey, iv);
      decipher.setAuthTag(authTag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
      const salt = Buffer.from(record.salt_b64, "base64");
      const expectedHash = Buffer.from(record.hash.value_hex, "hex");
      const actualHash = Buffer.from(computeHashHex(salt, plain), "hex");
      if (expectedHash.length !== actualHash.length || !timingSafeEqual(expectedHash, actualHash)) continue;
      return plain;
    } catch {
      continue;
    }
  }

  return undefined;
}

export function deepGet(target: Record<string, any>, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = target;
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function deepSet(target: Record<string, any>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) return;
  let current: Record<string, any> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const next = current[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) current[key] = {};
    current = current[key];
  }
  current[parts[parts.length - 1]!] = value;
}

export function cloneObject<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

export function secretFileDirectory(scope: string, overrideAuthDir?: string): string {
  return dirname(secretFilePath(scope, "placeholder", overrideAuthDir));
}
