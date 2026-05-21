import type {
	CapabilityRunner,
	RunContext,
} from "@/gateway/core/contracts/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";

export class McpRunner implements CapabilityRunner<Record<string, any>, any> {
	readonly kind = "mcp" as const;

	constructor(private registry: MCPRegistry) {}

	async run(
		name: string,
		args: Record<string, any> = {},
		_context?: RunContext,
	): Promise<any> {
		const mcpName = name.replace(/^mcp:/, "");
		return await this.registry.callTool(mcpName, args);
	}
}
