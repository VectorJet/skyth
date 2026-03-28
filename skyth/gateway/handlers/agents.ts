import type { AgentRegistry } from "@/registries/agent_registry";
import type { GatewayClient } from "@/gateway/protocol";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";

export interface AgentsHandlerDeps {
	agentRegistry: AgentRegistry;
	getAuthenticatedNode: (client: GatewayClient) => {
		node_id: string;
		channel: string;
		sender_id: string;
	} | null;
}

export interface AgentEntry {
	id: string;
	name: string;
	description?: string;
	emoji?: string;
	avatar?: string;
	root: string;
	manifestPath: string;
	globalTools: boolean;
}

export interface AgentsListResult {
	agents: AgentEntry[];
	total: number;
}

export interface AgentIdentityResult {
	id: string;
	name: string;
	description?: string;
	emoji?: string;
	avatar?: string;
	root: string;
	workspace: string;
}

export interface AgentFileEntry {
	name: string;
	path: string;
	missing: boolean;
	size?: number;
	updatedAtMs?: number;
}

export interface AgentsFilesListResult {
	agentId: string;
	workspace: string;
	files: AgentFileEntry[];
}

export interface AgentsFilesGetResult {
	agentId: string;
	workspace: string;
	file: AgentFileEntry & { content?: string };
}

const BOOTSTRAP_FILE_NAMES = [
	"AGENTS.md",
	"SOUL.md",
	"TOOLS.md",
	"IDENTITY.md",
	"USER.md",
	"HEARTBEAT.md",
	"BOOTSTRAP.md",
] as const;

const MEMORY_FILE_NAMES = ["MEMORY.md", "MEMORY.alt.md"] as const;

const ALLOWED_FILE_NAMES = new Set<string>([...BOOTSTRAP_FILE_NAMES, ...MEMORY_FILE_NAMES]);

function resolveAgentWorkspaceDir(root: string, agentId: string): string {
	// Default workspace is in the skyth/agents directory
	return join(root, "skyth", "agents", agentId);
}

function loadAgentManifest(manifestPath: string): Record<string, unknown> | null {
	try {
		return JSON.parse(readFileSync(manifestPath, "utf-8"));
	} catch {
		return null;
	}
}

function parseIdentityFile(workspaceDir: string): {
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

function listAgentFiles(workspaceDir: string): AgentFileEntry[] {
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

function validateFilePath(workspaceDir: string, name: string): string {
	// Resolve the full path and verify it stays within workspaceDir
	const resolved = resolve(workspaceDir, name);
	const workspaceRoot = resolve(workspaceDir);
	if (!resolved.startsWith(workspaceRoot) || isAbsolute(name)) {
		throw new Error("invalid file path: path escape attempt detected");
	}
	return resolved;
}

export function createAgentsHandlers(deps: AgentsHandlerDeps) {
	const { agentRegistry, getAuthenticatedNode } = deps;

	return {
		"agents.list": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as {
				limit?: number;
				offset?: number;
			} | undefined;

			const allIds = agentRegistry.ids;
			const offset = p?.offset ?? 0;
			const limit = Math.min(p?.limit ?? 50, 200);
			const paginatedIds = allIds.slice(offset, offset + limit);

		const agents: AgentEntry[] = [];
		for (const id of paginatedIds) {
			const entry = agentRegistry.get(id);
			if (!entry) {
				continue;
			}

			const manifest = loadAgentManifest(entry.manifestPath);
			const workspaceDir = resolveAgentWorkspaceDir(
				entry.root,
				id,
			);
			const identity = parseIdentityFile(workspaceDir);

			agents.push({
				id,
				name: identity.name ?? id,
				description: identity.description,
				emoji: identity.emoji,
				avatar: identity.avatar,
				root: entry.root,
				manifestPath: entry.manifestPath,
				globalTools: agentRegistry.globalToolsEnabled(id),
			});
		}

			return {
				agents,
				total: allIds.length,
			} as AgentsListResult;
		},

		"agents.identity": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as { agentId?: string } | undefined;
			const agentId = p?.agentId;

			if (!agentId) {
				throw new Error("agentId is required");
			}

			const entry = agentRegistry.get(agentId);
			if (!entry) {
				throw new Error(`agent "${agentId}" not found`);
			}

			const workspaceDir = resolveAgentWorkspaceDir(entry.root, agentId);
			const identity = parseIdentityFile(workspaceDir);

			return {
				id: agentId,
				name: identity.name ?? agentId,
				description: identity.description,
				emoji: identity.emoji,
				avatar: identity.avatar,
				root: entry.root,
				workspace: workspaceDir,
			} as AgentIdentityResult;
		},

		"agents.files.list": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as { agentId?: string } | undefined;
			const agentId = p?.agentId;

			if (!agentId) {
				throw new Error("agentId is required");
			}

			const entry = agentRegistry.get(agentId);
			if (!entry) {
				throw new Error(`agent "${agentId}" not found`);
			}

			const workspaceDir = resolveAgentWorkspaceDir(entry.root, agentId);
			const files = listAgentFiles(workspaceDir);

			return {
				agentId,
				workspace: workspaceDir,
				files,
			} as AgentsFilesListResult;
		},

		"agents.files.get": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as { agentId?: string; name?: string } | undefined;
			const agentId = p?.agentId;
			const name = p?.name;

			if (!agentId) {
				throw new Error("agentId is required");
			}
			if (!name) {
				throw new Error("file name is required");
			}

			if (!ALLOWED_FILE_NAMES.has(name)) {
				throw new Error(`unsupported file "${name}"`);
			}

			const entry = agentRegistry.get(agentId);
			if (!entry) {
				throw new Error(`agent "${agentId}" not found`);
			}

			const workspaceDir = resolveAgentWorkspaceDir(entry.root, agentId);
			const filePath = validateFilePath(workspaceDir, name);

			try {
				const stat = statSync(filePath);
				if (!stat.isFile()) {
					return {
						agentId,
						workspace: workspaceDir,
						file: { name, path: filePath, missing: true },
					} as AgentsFilesGetResult;
				}

				const content = readFileSync(filePath, "utf-8");
				return {
					agentId,
					workspace: workspaceDir,
					file: {
						name,
						path: filePath,
						missing: false,
						size: stat.size,
						updatedAtMs: Math.floor(stat.mtimeMs),
						content,
					},
				} as AgentsFilesGetResult;
			} catch {
				return {
					agentId,
					workspace: workspaceDir,
					file: { name, path: filePath, missing: true },
				} as AgentsFilesGetResult;
			}
		},

		"agents.files.set": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as { agentId?: string; name?: string; content?: string } | undefined;
			const agentId = p?.agentId;
			const name = p?.name;
			const content = p?.content ?? "";

			if (!agentId) {
				throw new Error("agentId is required");
			}
			if (!name) {
				throw new Error("file name is required");
			}

			if (!ALLOWED_FILE_NAMES.has(name)) {
				throw new Error(`unsupported file "${name}"`);
			}

			const entry = agentRegistry.get(agentId);
			if (!entry) {
				throw new Error(`agent "${agentId}" not found`);
			}

			const workspaceDir = resolveAgentWorkspaceDir(entry.root, agentId);
			const filePath = validateFilePath(workspaceDir, name);

			// Write the file
			const { writeFileSync, mkdirSync } = await import("node:fs");
			mkdirSync(workspaceDir, { recursive: true });
			writeFileSync(filePath, content, "utf-8");

			const stat = statSync(filePath);
			return {
				ok: true,
				agentId,
				workspace: workspaceDir,
				file: {
					name,
					path: filePath,
					missing: false,
					size: stat.size,
					updatedAtMs: Math.floor(stat.mtimeMs),
					content,
				},
			} as AgentsFilesGetResult & { ok: boolean };
		},
	};
}