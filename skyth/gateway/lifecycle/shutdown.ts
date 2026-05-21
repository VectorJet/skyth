import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";

export async function setupGracefulShutdown(mcpRegistry: MCPRegistry) {
	// Handle graceful shutdown
	process.on("SIGINT", async () => {
		console.log("\n\nShutting down MCP Gateway...");
		await mcpRegistry.shutdown();
		process.exit(0);
	});
}
