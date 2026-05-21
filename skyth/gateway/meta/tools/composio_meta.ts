import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";

const COMPOSIO_META_TOOLS: Array<{ name: string; rawName: string }> = [
	{ name: "composio_search_tools", rawName: "COMPOSIO_SEARCH_TOOLS" },
	{
		name: "composio_manage_connections",
		rawName: "COMPOSIO_MANAGE_CONNECTIONS",
	},
	{
		name: "composio_wait_for_connections",
		rawName: "COMPOSIO_WAIT_FOR_CONNECTIONS",
	},
	{ name: "composio_get_tool_schemas", rawName: "COMPOSIO_GET_TOOL_SCHEMAS" },
	{
		name: "composio_multi_execute_tool",
		rawName: "COMPOSIO_MULTI_EXECUTE_TOOL",
	},
	{ name: "composio_remote_bash_tool", rawName: "COMPOSIO_REMOTE_BASH_TOOL" },
	{ name: "composio_remote_workbench", rawName: "COMPOSIO_REMOTE_WORKBENCH" },
];

let mcpRegistry: MCPRegistry | null = null;

export function setMcpRegistry(registry: MCPRegistry) {
	mcpRegistry = registry;
}

function requireComposioServer() {
	const server = mcpRegistry?.getServer("composio");
	if (!server) throw new Error("Composio MCP server is not running");
	return server;
}

export function getComposioMetaTools(): Map<string, any> {
	const tools = new Map<string, any>();
	const server = mcpRegistry?.getServer("composio");
	if (!server) return tools;

	for (const spec of COMPOSIO_META_TOOLS) {
		const rawTool = server.tools.get(spec.rawName);
		if (!rawTool) continue;
		tools.set(spec.name, {
			name: spec.name,
			description: rawTool.description || `Run Composio ${spec.rawName}`,
			inputSchema: rawTool.inputSchema || { type: "object", properties: {} },
			source: "meta",
		});
	}

	return tools;
}

export async function executeComposioMetaTool(
	name: string,
	args: Record<string, any>,
): Promise<any> {
	requireComposioServer();
	const spec = COMPOSIO_META_TOOLS.find((item) => item.name === name);
	if (!spec) throw new Error(`Composio meta-tool "${name}" not found`);
	return await mcpRegistry!.callTool(`composio_${spec.rawName}`, args || {});
}
