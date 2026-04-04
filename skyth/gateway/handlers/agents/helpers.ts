import { readFileSync, statSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import type { AgentFileEntry } from "./types";

export const BOOTSTRAP_FILE_NAMES = [
	"AGENTS.md",
	"SOUL.md",
	"TOOLS.md",
	"IDENTITY.md",
	"USER.md",
	"HEARTBEAT.md",
	"BOOTSTRAP.md",
] as const;

export const MEMORY_FILE_NAMES = ["MEMORY.md", "MEMORY.alt.md"] as const;

export const ALLOWED_FILE_NAMES = new Set<string>([
	...BOOTSTRAP_FILE_NAMES,
	...MEMORY_FILE_NAMES,
]);

export function resolveAgentWorkspaceDir(
	root: string,
	agentId: string,
): string {
	// Fix: AgentRegistry entry.root is the actual agent directory
	return root;
}

export function loadAgentManifest(
	manifestPath: string,
): Record<string, unknown> | null {
	try {
		return JSON.parse(readFileSync(manifestPath, "utf-8"));
	} catch {
		return null;
	}
}

export function parseIdentityFile(workspaceDir: string): {
	name?: string;
	description?: string;
	emoji?: string;
	avatar?: string;
} {
	try {
		const identityPath = join(workspaceDir, "IDENTITY.md");
		const content = readFileSync(identityPath, "utf-8");
		const result: Record<string, string> = {};

		// Parse markdown-like format: "- Key: Value"
		const lines = content.split("\n");
		for (const line of lines) {
			const match = line.match(/^-\s+(\w+):\s*(.+)$/);
			if (match) {
				const key = match[1]?.toLowerCase();
				const value = match[2]?.trim();
				if (key && value) {
					result[key] = value;
				}
			}
		}

		return {
			name: result.name,
			description: result.description,
			emoji: result.emoji,
			avatar: result.avatar,
		};
	} catch {
		return {};
	}
}

export function listAgentFiles(workspaceDir: string): AgentFileEntry[] {
	const files: AgentFileEntry[] = [];

	// List bootstrap files
	for (const name of BOOTSTRAP_FILE_NAMES) {
		const filePath = join(workspaceDir, name);
		try {
			const stat = statSync(filePath);
			if (stat.isFile()) {
				files.push({
					name,
					path: filePath,
					missing: false,
					size: stat.size,
					updatedAtMs: Math.floor(stat.mtimeMs),
				});
			} else {
				files.push({ name, path: filePath, missing: true });
			}
		} catch {
			files.push({ name, path: filePath, missing: true });
		}
	}

	// Check for memory files
	for (const name of MEMORY_FILE_NAMES) {
		const filePath = join(workspaceDir, name);
		try {
			const stat = statSync(filePath);
			if (stat.isFile()) {
				files.push({
					name,
					path: filePath,
					missing: false,
					size: stat.size,
					updatedAtMs: Math.floor(stat.mtimeMs),
				});
			}
		} catch {
			// File doesn't exist, skip
		}
	}

	return files;
}

export function validateFilePath(workspaceDir: string, name: string): string {
	// Resolve the full path and verify it stays within workspaceDir
	const resolved = resolve(workspaceDir, name);
	const workspaceRoot = resolve(workspaceDir);
	if (!resolved.startsWith(workspaceRoot) || isAbsolute(name)) {
		throw new Error("invalid file path: path escape attempt detected");
	}
	return resolved;
}
