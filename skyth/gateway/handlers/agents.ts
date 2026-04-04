import type { AgentRegistry } from "@/registries/agent_registry";
import type { GatewayClient } from "@/gateway/protocol";
import { readFileSync, statSync } from "node:fs";
import { 
	type AgentEntry, 
	type AgentsListResult, 
	type AgentIdentityResult, 
	type AgentsFilesListResult, 
	type AgentsFilesGetResult 
} from "./agents/types";
import { 
	ALLOWED_FILE_NAMES, 
	resolveAgentWorkspaceDir, 
	loadAgentManifest, 
	parseIdentityFile, 
	listAgentFiles, 
	validateFilePath 
} from "./agents/helpers";

export interface AgentsHandlerDeps {
	agentRegistry: AgentRegistry;
	getAuthenticatedNode: (client: GatewayClient) => {
		node_id: string;
		channel: string;
		sender_id: string;
	} | null;
}

export function createAgentsHandlers(deps: AgentsHandlerDeps) {
	const { agentRegistry } = deps;

	return {
		"agents.list": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as
				| {
						limit?: number;
						offset?: number;
				  }
				| undefined;

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

				const workspaceDir = resolveAgentWorkspaceDir(entry.root, id);
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
			const p = params as
				| { agentId?: string; name?: string; content?: string }
				| undefined;
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
