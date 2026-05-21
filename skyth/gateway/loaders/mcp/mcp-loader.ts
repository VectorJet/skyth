import type { HookManager } from "@/gateway/hooks/index.ts";
import type { LoadSource } from "@/gateway/core/contracts/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";

export interface McpSourceLoaderOptions {
	source?: LoadSource;
	hooks?: HookManager;
}

export class McpSourceLoader {
	constructor(
		private registry: MCPRegistry,
		private options: McpSourceLoaderOptions = {},
	) {}

	async loadAll(): Promise<void> {
		await this.registry.initialize();
	}
}
