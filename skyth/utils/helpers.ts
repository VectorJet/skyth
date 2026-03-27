import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function uuidv7(): string {
	const now = Date.now();
	const timestamp = Math.floor(now).toString(16).padStart(12, "0");
	const randomPart = randomUUID().replace(/-/g, "").slice(14);
	return `${timestamp}-0${randomPart.slice(0, 3)}-7${randomPart.slice(3, 12)}`;
}

export function generateSessionId(): string {
	return uuidv7();
}

export function ensureDir(path: string): string {
	mkdirSync(path, { recursive: true });
	return path;
}

export function safeFilename(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getDataPath(): string {
	return ensureDir(join(homedir(), ".skyth"));
}

export function getWorkspacePath(): string {
	return join(getDataPath(), "workspace");
}
