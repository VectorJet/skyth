import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs, strFlag } from "@/cli/runtime_helpers";
import { createInterface } from "node:readline";

const API_KEYS_FILE = "api_keys.json";

export interface ApiKeyRecord {
  key_id: string;
  key_hash: string;
  name: string;
  scopes: string[];
  created_at: string;
  last_used: string | null;
  usage_count: number;
}

interface ApiKeysStore {
  keys: ApiKeyRecord[];
}

function homePath(): string {
  return process.env.HOME || homedir();
}

function authRoot(overrideAuthDir?: string): string {
  return overrideAuthDir || join(homePath(), ".skyth", "auth");
}

function apiKeysPath(overrideAuthDir?: string): string {
  return join(authRoot(overrideAuthDir), API_KEYS_FILE);
}

function ensureAuthPaths(overrideAuthDir?: string): void {
  const root = authRoot(overrideAuthDir);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  try {
    chmodSync(root, 0o700);
  } catch {
    // Best effort.
  }
}

function loadApiKeys(overrideAuthDir?: string): ApiKeysStore {
  const path = apiKeysPath(overrideAuthDir);
  if (!existsSync(path)) {
    return { keys: [] };
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.keys)) {
      return { keys: [] };
    }
    return parsed as ApiKeysStore;
  } catch {
    return { keys: [] };
  }
}

function saveApiKeys(store: ApiKeysStore, overrideAuthDir?: string): void {
  const path = apiKeysPath(overrideAuthDir);
  writeFileSync(path, JSON.stringify(store, null, 2), { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort.
  }
}

function findKeyByIdOrName(store: ApiKeysStore, query: string): ApiKeyRecord | undefined {
  return store.keys.find(
    (k) => k.key_id === query || k.name.toLowerCase() === query.toLowerCase()
  );
}

export async function saveKeyCommandHandler(args: string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args);
  
  const key = positionals[0] ?? strFlag(flags, "key");
  const name = strFlag(flags, "name");

  if (!key) {
    console.error("Error: API key is required");
    console.log("Usage: skyth auth save-key {key} --name 'my-script'");
    return 1;
  }

  if (!name) {
    console.error("Error: --name is required");
    console.log("Usage: skyth auth save-key {key} --name 'my-script'");
    return 1;
  }

  // Validate key format
  if (!key.startsWith("sk_skyth_")) {
    console.error("Error: Invalid API key format. Keys should start with 'sk_skyth_'");
    return 1;
  }

  // Generate key hash and ID from the key itself
  const keyHash = require("node:crypto").createHash("sha256").update(key, "utf-8").digest("hex");
  const keyId = key.slice(-8); // Use last 8 chars as ID

  const record: ApiKeyRecord = {
    key_id: keyId,
    key_hash: keyHash,
    name,
    scopes: ["read"], // Default scope
    created_at: new Date().toISOString(),
    last_used: null,
    usage_count: 0,
  };

  ensureAuthPaths();
  const store = loadApiKeys();
  
  // Check for duplicates
  const existing = store.keys.find((k) => k.key_hash === keyHash);
  if (existing) {
    console.error(`Error: This key has already been saved as '${existing.name}'`);
    return 1;
  }

  store.keys.push(record);
  saveApiKeys(store);

  console.log(`API key saved successfully!`);
  console.log(`Name: ${name}`);
  console.log(`ID: ${keyId}`);

  return 0;
}
