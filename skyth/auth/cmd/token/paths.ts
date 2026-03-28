import { existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEVICE_DIR = "device";
const IDENTITY_DIR = "identity";
const TOKEN_FILE = "token";
const NODES_FILE = "nodes.json";

function homePath(): string {
	return process.env.HOME || homedir();
}

export function authRoot(overrideAuthDir?: string): string {
	return overrideAuthDir || join(homePath(), ".skyth", "auth");
}

export function deviceRoot(overrideAuthDir?: string): string {
	return join(authRoot(overrideAuthDir), DEVICE_DIR);
}

export function identityDir(overrideAuthDir?: string): string {
	return join(deviceRoot(overrideAuthDir), IDENTITY_DIR);
}

export function tokenPath(overrideAuthDir?: string): string {
	return join(identityDir(overrideAuthDir), TOKEN_FILE);
}

export function nodesPath(overrideAuthDir?: string): string {
	return join(identityDir(overrideAuthDir), NODES_FILE);
}

export function hasDeviceToken(overrideAuthDir?: string): boolean {
	const path = tokenPath(overrideAuthDir);
	return existsSync(path);
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