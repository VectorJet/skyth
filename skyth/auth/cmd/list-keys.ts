import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "@/cli/runtime_helpers";

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

export async function listKeysCommandHandler(args: string[], passedFlags?: Record<string, string | boolean>): Promise<number> {
  const store = loadApiKeys();
  
  if (store.keys.length === 0) {
    console.log("No API keys found.");
    console.log("Create one with: skyth auth create-key --name 'my-script'");
    return 0;
  }

  console.log(`API Keys (${store.keys.length})`);
  console.log("");
  console.log("ID\t\t\tName\t\t\tScopes\t\tCreated\t\t\tLast Used\t\tUsage");

  for (const key of store.keys) {
    const created = key.created_at.split("T")[0];
    const lastUsed = key.last_used ? key.last_used.split("T")[0] : "never";
    console.log(
      `${key.key_id}\t${key.name}\t\t${key.scopes.join(",")}\t${created}\t\t${lastUsed}\t\t${key.usage_count}`
    );
  }

  return 0;
}
