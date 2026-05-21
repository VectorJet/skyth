import type {
	CapabilityRunner,
	RunContext,
} from "@/gateway/core/contracts/index.ts";
import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";

export class ToolRunner implements CapabilityRunner<Record<string, any>, any> {
	readonly kind = "tool" as const;

	constructor(private registry: ToolRegistry) {}

	async run(
		name: string,
		args: Record<string, any> = {},
		_context?: RunContext,
	): Promise<any> {
		const result = await this.registry.executeTool(name, args);
		if (!result.success) throw new Error(result.error || `Tool ${name} failed`);
		return result.result;
	}
}
