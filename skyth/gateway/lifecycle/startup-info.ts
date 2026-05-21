import { PORT } from "@/gateway/server/config";

export function printStartupInfo() {
	console.log(`\n>>> MCP Gateway running on http://localhost:${PORT}`);
	console.log(`\nAvailable endpoints:`);
	console.log(`  GET    /health                   - Health check`);
	console.log(`  GET    /tools                    - List all tools`);
	console.log(`  POST   /tools                    - Register a custom tool`);
	console.log(`  POST   /tools/:toolName          - Execute a tool`);
	console.log(
		`  POST   /tools/:toolName/stream   - Execute a tool (streaming)`,
	);
	console.log(`  DELETE /tools/:toolName          - Unregister a custom tool`);
	console.log(`  GET    /servers                  - List all servers`);
	console.log(`  GET    /servers/:serverName      - Get server info`);
	console.log(`  GET    /pipelines                - List all pipelines`);
	console.log(`  POST   /pipelines/:name/execute  - Execute a pipeline`);
	console.log(`\nPress Ctrl+C to exit.\n`);
}
