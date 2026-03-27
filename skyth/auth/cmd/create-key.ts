import {
	appendFileSync,
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { boolFlag, parseArgs, strFlag } from "@/cli/runtime_helpers";

const API_KEYS_FILE = "api_keys.json";
const KEY_PREFIX = "sk_skyth_";
const KEY_BYTES = 24;

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

function generateApiKey(): string {
	const bytes = randomBytes(KEY_BYTES);
	return KEY_PREFIX + bytes.toString("base64url");
}

function hashKey(key: string): string {
	return createHash("sha256").update(key, "utf-8").digest("hex");
}

function generateKeyId(): string {
	return randomBytes(8).toString("hex");
}

export async function createKeyCommandHandler(
	args: string[],
	passedFlags?: Record<string, string | boolean>,
): Promise<number> {
	const { flags, positionals } = passedFlags
		? { flags: passedFlags, positionals: args }
		: parseArgs(args);

	const name = strFlag(flags, "name");
	const scopesStr = strFlag(flags, "scopes") ?? "read";

	if (!name) {
		console.error("Error: --name is required");
		console.log(
			"Usage: skyth auth create-key --name 'my-script' --scopes read,write",
		);
		return 1;
	}

	const scopes = scopesStr
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (scopes.length === 0) {
		console.error("Error: at least one scope is required");
		return 1;
	}

	// Validate scopes
	const validScopes = ["read", "write", "admin"];
	for (const scope of scopes) {
		if (!validScopes.includes(scope)) {
			console.error(
				`Error: invalid scope '${scope}'. Valid scopes: ${validScopes.join(", ")}`,
			);
			return 1;
		}
	}

	const apiKey = generateApiKey();
	const keyHash = hashKey(apiKey);
	const keyId = generateKeyId();

	const record: ApiKeyRecord = {
		key_id: keyId,
		key_hash: keyHash,
		name,
		scopes,
		created_at: new Date().toISOString(),
		last_used: null,
		usage_count: 0,
	};

	ensureAuthPaths();
	const store = loadApiKeys();
	store.keys.push(record);
	saveApiKeys(store);

	console.log("API key created successfully!");
	console.log("");
	console.log(`Key: ${apiKey}`);
	console.log(`Name: ${name}`);
	console.log(`Scopes: ${scopes.join(", ")}`);
	console.log(`Created: ${record.created_at}`);
	console.log("");
	console.log("IMPORTANT: Save this key securely. It won't be shown again.");

	return 0;
}
