import type { ToolRuntime, ToolExecutionContext } from "@/base/base_agent/runtime/types";
import type { MemoryManager } from "@/base/base_agent/memory/manager";

export class EmptyToolRuntime implements ToolRuntime {
	getDefinitions(): Array<Record<string, unknown>> {
		return [];
	}

	async execute(name: string): Promise<unknown> {
		throw new Error(`Tool '${name}' is not available in this runtime`);
	}
}

export class MemoryAwareToolRuntime implements ToolRuntime {
	constructor(
		private readonly inner: ToolRuntime,
		private readonly memory: MemoryManager,
		private readonly memoryContext: {
			threadId: string;
			runId: string;
			surface?: string;
			model?: string;
			metadata?: Record<string, unknown>;
		},
	) {}

	getDefinitions(): Array<Record<string, unknown>> {
		return [
			...this.inner.getDefinitions(),
			...this.memory.getToolSchemas().map((schema) => ({
				type: "function",
				function: schema,
			})),
		];
	}

	async execute(
		name: string,
		args: Record<string, unknown>,
		context: ToolExecutionContext,
	): Promise<unknown> {
		if (
			this.memory
				.getToolSchemas()
				.some((schema) => String(schema.name ?? "") === name)
		) {
			return await this.memory.handleToolCall(name, args, {
				...this.memoryContext,
				runId: context.runId,
				toolCount: context.stepIndex + 1,
			});
		}
		return await this.inner.execute(name, args, context);
	}
}
