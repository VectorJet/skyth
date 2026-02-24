import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import * as argon2 from "argon2";

const SUPERUSER_HASH_FILE = "superuser_password.jsonl";
const ARGON2_MEMORY_COST = 19456;
const ARGON2_TIME_COST = 2;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32;
const SALT_BYTES = 4; // 32-bit random seed per current requirement.
const ARGON2_SALT_BYTES = 16;
const IV_BYTES = 12;

export interface SuperuserPasswordRecord {
  version: 1;
  kind: "superuser_password";
  created_at: string;
  salt_bits: 32;
  salt_b64: string;
  kdf: {
    algorithm: "argon2id";
    salt_derivation: "sha256(seed32)[0:16]";
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
}

function homePath(): string {
  return process.env.HOME || homedir();
}

function authRoot(overrideAuthDir?: string): string {
  return overrideAuthDir || join(homePath(), ".skyth", "auth");
}

export function superuserHashesDir(overrideAuthDir?: string): string {
  return join(authRoot(overrideAuthDir), "superuser", "hashes");
}

export function superuserHashesPath(overrideAuthDir?: string): string {
  return join(superuserHashesDir(overrideAuthDir), SUPERUSER_HASH_FILE);
}

function ensureAuthPaths(overrideAuthDir?: string): void {
  const root = authRoot(overrideAuthDir);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  try {
    chmodSync(root, 0o700);
  } catch {
    // Best effort permissions tightening.
  }

  const superuserDir = join(root, "superuser");
  mkdirSync(superuserDir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(superuserDir, 0o700);
  } catch {
    // Best effort permissions tightening.
  }

  const hashes = superuserHashesDir(overrideAuthDir);
  mkdirSync(hashes, { recursive: true, mode: 0o700 });
  try {
    chmodSync(hashes, 0o700);
  } catch {
    // Best effort permissions tightening.
  }
}

export function hasSuperuserPasswordRecord(overrideAuthDir?: string): boolean {
  const path = superuserHashesPath(overrideAuthDir);
  if (!existsSync(path)) return false;
  try {
    const raw = readFileSync(path, "utf-8");
    return raw.split("\n").some((line) => line.trim().length > 0);
  } catch {
    return false;
  }
}

export async function writeSuperuserPasswordRecord(
  password: string,
  overrideAuthDir?: string,
): Promise<{ path: string; record: SuperuserPasswordRecord }> {
  const trimmed = password.trim();
  if (!trimmed) {
    throw new Error("Superuser password cannot be empty.");
  }

  ensureAuthPaths(overrideAuthDir);

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
  const ciphertext = Buffer.concat([cipher.update(trimmed, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const record: SuperuserPasswordRecord = {
    version: 1,
    kind: "superuser_password",
    created_at: new Date().toISOString(),
    salt_bits: 32,
    salt_b64: saltSeed.toString("base64"),
    kdf: {
      algorithm: "argon2id",
      salt_derivation: "sha256(seed32)[0:16]",
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
  };

  const path = superuserHashesPath(overrideAuthDir);
  appendFileSync(path, `${JSON.stringify(record)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort permissions tightening.
  }

  return { path, record };
}

export async function verifySuperuserPassword(
  password: string,
  overrideAuthDir?: string,
): Promise<boolean> {
  const trimmed = password.trim();
  if (!trimmed) return false;

  const path = superuserHashesPath(overrideAuthDir);
  if (!existsSync(path)) return false;

  let lines: string[] = [];
  try {
    lines = readFileSync(path, "utf-8").split("\n").filter((line) => line.trim().length > 0);
  } catch {
    return false;
  }

  // Check most recent records first.
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as Partial<SuperuserPasswordRecord>;
      const hash = parsed?.kdf?.hash;
      if (!hash) continue;
      if (await argon2.verify(hash, trimmed)) return true;
    } catch {
      continue;
    }
  }

  return false;
}
