import type { Hono } from "hono";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";

export function registerServerRoutes(app: Hono, mcpRegistry: MCPRegistry) {
	// List all servers
	app.get("/servers", (c) => {
		const servers = Array.from(mcpRegistry.getAllServers().entries()).map(
			([name, instance]) => ({
				name,
				description: instance.manifest.description,
				status: instance.status,
				tools: Array.from(instance.tools.keys()),
				toolCount: instance.tools.size,
			}),
		);

		return c.json({
			count: servers.length,
			servers,
		});
	});

	// Get specific server info
	app.get("/servers/:serverName", (c) => {
		const serverName = c.req.param("serverName");
		const server = mcpRegistry.getServer(serverName);

		if (!server) {
			return c.json(
				{
					error: `Server ${serverName} not found`,
				},
				404,
			);
		}

		return c.json({
			name: server.name,
			description: server.manifest.description,
			status: server.status,
			tools: Array.from(server.tools.entries()).map(([name, tool]) => ({
				name,
				description: tool.description,
				inputSchema: tool.inputSchema,
			})),
		});
	});
}
