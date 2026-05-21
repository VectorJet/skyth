import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
	appendFileSync,
	copyFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { WORKSPACE_ROOT } from "@/gateway/workspace/index.ts";
import { envFirst } from "@/gateway/config/env.ts";

export const DEFAULT_MEMORY_ROOT =
	envFirst("SKYTH_GATEWAY_MEMORY_ROOT", "CLAUDE_GATEWAY_MEMORY_ROOT") ??
	join(WORKSPACE_ROOT, "default", "MEMORY");

export const MEMORY_ARCHIVE_SOURCE_PREFIX = "memory_archive:";

export interface ArchivedMemoryFile {
	filePath: string;
	relativePath: string;
	source: string;
}

export function dateStamp(ts = Date.now()): string {
	return new Date(ts).toISOString().slice(0, 10);
}

function safeSegment(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "unknown";
}

function ensureInside(root: string, filePath: string): string {
	const resolvedRoot = resolve(root);
	const resolvedPath = resolve(filePath);
	if (
		resolvedPath !== resolvedRoot &&
		!resolvedPath.startsWith(resolvedRoot + sep)
	) {
		throw new Error(`Path escapes memory root: ${filePath}`);
	}
	return resolvedPath;
}

function sourceFor(root: string, filePath: string): ArchivedMemoryFile {
	const resolvedRoot = resolve(root);
	const resolvedPath = ensureInside(root, filePath);
	const rel = relative(resolvedRoot, resolvedPath).replaceAll("\\", "/");
	return {
		filePath: resolvedPath,
		relativePath: rel,
		source: `${MEMORY_ARCHIVE_SOURCE_PREFIX}${rel}`,
	};
}

export function ensureMemoryArchive(root: string = DEFAULT_MEMORY_ROOT): void {
	mkdirSync(root, { recursive: true });
	mkdirSync(join(root, "raw"), { recursive: true });
	mkdirSync(join(root, "raw", "skyth"), { recursive: true });
	mkdirSync(join(root, "raw", "claude"), { recursive: true });
	mkdirSync(join(root, "normalized"), { recursive: true });
}

export function archiveClaudeExportFile(
	inputPath: string,
	root: string = DEFAULT_MEMORY_ROOT,
): ArchivedMemoryFile {
	ensureMemoryArchive(root);
	const resolvedInput = resolve(inputPath);
	const inputName = basename(resolvedInput) || "conversations.json";
	const target =
		inputName === "conversations.json"
			? join(root, "raw", "claude", "conversations.json")
			: join(root, "raw", dateStamp(), "claude", inputName);
	mkdirSync(dirname(target), { recursive: true });
	const resolvedTarget = ensureInside(root, target);
	if (resolvedInput !== resolvedTarget)
		copyFileSync(resolvedInput, resolvedTarget);
	return sourceFor(root, resolvedTarget);
}

export function archiveClaudePayload(
	payload: unknown,
	provider = "claude",
	root: string = DEFAULT_MEMORY_ROOT,
): ArchivedMemoryFile {
	ensureMemoryArchive(root);
	const items = Array.isArray(payload) ? payload : [payload];
	const first = items.find((item) => item && typeof item === "object") as
		| { uuid?: string }
		| undefined;
	const id = first?.uuid
		? safeSegment(first.uuid)
		: createHash("sha256")
				.update(JSON.stringify(payload))
				.digest("hex")
				.slice(0, 16);
	const fileName = Array.isArray(payload)
		? `conversations-${Date.now()}-${id}.json`
		: `${id}.json`;
	const target = join(
		root,
		"raw",
		dateStamp(),
		safeSegment(provider),
		fileName,
	);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, JSON.stringify(payload, null, 2));
	return sourceFor(root, target);
}

export function appendGatewayTurnRecord(
	record: Record<string, unknown>,
	root: string = DEFAULT_MEMORY_ROOT,
): ArchivedMemoryFile {
	ensureMemoryArchive(root);
	const channel = safeSegment(String(record.channel ?? "gateway"));
	const chatId = safeSegment(String(record.chatId ?? "chat"));
	const target = join(
		root,
		"raw",
		dateStamp(typeof record.ts === "number" ? record.ts : Date.now()),
		"gateway",
		`${channel}-${chatId}.jsonl`,
	);
	mkdirSync(dirname(target), { recursive: true });
	appendFileSync(
		target,
		`${JSON.stringify({ type: "gateway_turn", ...record })}\n`,
	);
	return sourceFor(root, target);
}

export function listMemoryArchiveFiles(
	root: string = DEFAULT_MEMORY_ROOT,
): ArchivedMemoryFile[] {
	ensureMemoryArchive(root);
	const files: ArchivedMemoryFile[] = [];
	const rawRoot = join(root, "raw");
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (
				entry.isFile() &&
				(entry.name.endsWith(".json") || entry.name.endsWith(".jsonl"))
			) {
				files.push(sourceFor(root, full));
			}
		}
	};
	if (existsSync(rawRoot)) walk(rawRoot);
	files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
	return files;
}

export function memoryRootFromFilePath(filePath: string): string {
	const parts = resolve(filePath).split(sep);
	const memoryIndex = parts.lastIndexOf("MEMORY");
	if (memoryIndex === -1) return DEFAULT_MEMORY_ROOT;
	return parts.slice(0, memoryIndex + 1).join(sep) || sep;
}

export function readArchiveJson(file: ArchivedMemoryFile): unknown {
	return JSON.parse(readFileSync(file.filePath, "utf8"));
}

export function readArchiveJsonl(file: ArchivedMemoryFile): unknown[] {
	return readFileSync(file.filePath, "utf8")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

export function archiveStats(root: string = DEFAULT_MEMORY_ROOT) {
	ensureMemoryArchive(root);
	const files = listMemoryArchiveFiles(root);
	const bytes = files.reduce(
		(sum, file) => sum + statSync(file.filePath).size,
		0,
	);
	return { root: resolve(root), files: files.length, bytes };
}
