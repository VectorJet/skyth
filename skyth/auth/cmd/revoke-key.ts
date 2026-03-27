import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
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

function findKeyByIdOrName(
	store: ApiKeysStore,
	query: string,
): ApiKeyRecord | undefined {
	return store.keys.find(
		(k) => k.key_id === query || k.name.toLowerCase() === query.toLowerCase(),
	);
}

export async function revokeKeyCommandHandler(
	args: string[],
	passedFlags?: Record<string, string | boolean>,
): Promise<number> {
	const { flags, positionals } = passedFlags
		? { flags: passedFlags, positionals: args }
		: parseArgs(args);

	const keyIdOrName = positionals[0] ?? strFlag(flags, "name");
	const force =
		strFlag(flags, "force") === "true" || strFlag(flags, "f") === "true";

	if (!keyIdOrName) {
		console.error("Error: key id or name is required");
		console.log(
			"Usage: skyth auth revoke-key {key_id | --name 'key-name'} [--force]",
		);
		return 1;
	}

	const store = loadApiKeys();
	const key = findKeyByIdOrName(store, keyIdOrName);

	if (!key) {
		console.error(`Error: API key not found: ${keyIdOrName}`);
		return 1;
	}

	if (!force) {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: true,
		});
		const answer = await new Promise<string>((resolve) => {
			rl.question(
				`Revoke API key "${key.name}"?\n  ID: ${key.key_id}\n  Created: ${key.created_at}\n  Last used: ${key.last_used ?? "never"}\n  Usage count: ${key.usage_count}\n\n[y/N]: `,
				resolve,
			);
		});
		rl.close();

		if (
			answer.trim().toLowerCase() !== "y" &&
			answer.trim().toLowerCase() !== "yes"
		) {
			console.log("Aborted.");
			return 0;
		}
	}

	store.keys = store.keys.filter((k) => k.key_id !== key.key_id);
	saveApiKeys(store);

	console.log(
		`API key "${key.name}" (${key.key_id}) has been revoked and deleted.`,
	);

	return 0;
}
