import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QuasarClient } from "@/quasar/client.ts";

const SECRET_DB = join(homedir(), ".skyth", "quasar", "secrets.quasardb");
const SECRET_NAMESPACE = "secrets";

function encodePathPart(value: string): string {
	const safe = value.replace(/[^a-zA-Z0-9._-]/g, "_").trim();
	return safe || "default";
}

function secretPath(scope: string, subject: string, keyPath: string): string {
	return [
		"",
		encodePathPart(scope),
		encodePathPart(subject),
		`${encodePathPart(keyPath)}.txt`,
	].join("/");
}

async function openSecretDb(client: QuasarClient): Promise<void> {
	await client.openDb({
		dbPath: SECRET_DB,
		dbKind: "secrets",
		createIfMissing: true,
	});
}

export async function persistSecretValue(params: {
	scope: string;
	subject: string;
	keyPath: string;
	value: string;
}): Promise<void> {
	const plain = params.value.trim();
	if (!plain) return;
	const client = new QuasarClient({ timeoutMs: 5000 });
	await openSecretDb(client);
	await client.writeText({
		dbPath: SECRET_DB,
		namespace: SECRET_NAMESPACE,
		path: secretPath(params.scope, params.subject, params.keyPath),
		content: plain,
	});
}

export async function readLatestSecretValue(params: {
	scope: string;
	subject: string;
	keyPath: string;
}): Promise<string | undefined> {
	const client = new QuasarClient({ timeoutMs: 5000 });
	await openSecretDb(client);
	const value = await client.readText({
		dbPath: SECRET_DB,
		namespace: SECRET_NAMESPACE,
		path: secretPath(params.scope, params.subject, params.keyPath),
	});
	return value?.trim() || undefined;
}

function cliScriptPath(): string {
	return join(dirname(fileURLToPath(import.meta.url)), "quasar-secret-store-cli.ts");
}

export function persistSecretValueSync(params: {
	scope: string;
	subject: string;
	keyPath: string;
	value: string;
}): void {
	if (!params.value.trim()) return;
	execFileSync(
		"bun",
		[
			"run",
			cliScriptPath(),
			"set",
			params.scope,
			params.subject,
			params.keyPath,
			params.value,
		],
		{ stdio: "ignore" },
	);
}

export function readLatestSecretValueSync(params: {
	scope: string;
	subject: string;
	keyPath: string;
}): string | undefined {
	try {
		const output = execFileSync(
			"bun",
			[
				"run",
				cliScriptPath(),
				"get",
				params.scope,
				params.subject,
				params.keyPath,
			],
			{ encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
		).trim();
		return output || undefined;
	} catch {
		return undefined;
	}
}
