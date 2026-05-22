import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readJson<T>(path: string, fallback: T): T {
	if (!existsSync(path)) return fallback;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as T;
	} catch {
		return fallback;
	}
}

export function writeJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export function ensureDir(path: string): void {
	mkdirSync(path, { recursive: true });
}

export function readLines(path: string): string[] {
	try {
		return readFileSync(path, "utf-8")
			.split(/\r?\n/)
			.filter((line) => line.trim().length > 0);
	} catch {
		return [];
	}
}
