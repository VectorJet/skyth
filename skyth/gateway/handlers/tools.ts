import type { ToolRegistry } from "@/registries/tool_registry";
import type { GatewayClient } from "@/gateway/protocol";

export interface ToolsHandlerDeps {
	toolRegistry: ToolRegistry;
	getAuthenticatedNode: (client: GatewayClient) => {
		node_id: string;
		channel: string;
		sender_id: string;
	} | null;
}

export interface ToolCatalogEntry {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	scope: "agent" | "global" | "workspace";
}

export interface ToolsCatalogResult {
	tools: ToolCatalogEntry[];
	total: number;
}

export interface ToolsEffectiveResult {
	sessionKey: string;
	tools: ToolCatalogEntry[];
	total: number;
}

export function createToolsHandlers(deps: ToolsHandlerDeps) {
	const { toolRegistry, getAuthenticatedNode } = deps;

	return {
		"tools.catalog": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as
				| {
						scope?: string;
						limit?: number;
						offset?: number;
				  }
				| undefined;

			const allTools = toolRegistry.getDefinitions();
			const scopes = toolRegistry;

			let filtered = allTools;

			// Filter by scope if specified
			if (p?.scope) {
				filtered = filtered.filter((tool) => {
					const scope = scopes.scopeOf(tool.function?.name ?? "");
					return scope === p.scope;
				});
			}

			const offset = p?.offset ?? 0;
			const limit = Math.min(p?.limit ?? 100, 500);
			const paginated = filtered.slice(offset, offset + limit);

			const tools: ToolCatalogEntry[] = paginated.map((tool) => {
				const name = tool.function?.name ?? "";
				return {
					name,
					description: tool.function?.description ?? "",
					parameters: tool.function?.parameters ?? {},
					scope: scopes.scopeOf(name) ?? "global",
				};
			});

			return {
				tools,
				total: filtered.length,
			} as ToolsCatalogResult;
		},

		"tools.effective": async (
			_method: string,
			params: unknown,
			client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as { sessionKey?: string } | undefined;
			const sessionKey = p?.sessionKey;

			if (!sessionKey) {
				throw new Error("sessionKey is required");
			}

			// Get all global tools and workspace tools
			// For a session, effective tools would be global + any session-specific
			const allTools = toolRegistry.getDefinitions();
			const scopes = toolRegistry;

			// Get global and workspace tools (not agent-specific)
			const effectiveTools = allTools.filter((tool) => {
				const scope = scopes.scopeOf(tool.function?.name ?? "");
				return scope === "global" || scope === "workspace";
			});

			const tools: ToolCatalogEntry[] = effectiveTools.map((tool) => {
				const name = tool.function?.name ?? "";
				return {
					name,
					description: tool.function?.description ?? "",
					parameters: tool.function?.parameters ?? {},
					scope: scopes.scopeOf(name) ?? "global",
				};
			});

			return {
				sessionKey,
				tools,
				total: tools.length,
			} as ToolsEffectiveResult;
		},
	};
}
