import type {
	ToolCall,
	ToolExecutionContext,
	ToolResult,
	ToolRuntime,
} from "@/base/base_agent/runtime/types";

export interface ToolExecutorOptions {
	concurrency?: number;
}

function stringifyToolOutput(output: unknown): string {
	if (typeof output === "string") return output;
	if (output === undefined) return "";
	try {
		return JSON.stringify(output, null, 2);
	} catch {
		return String(output);
	}
}

export class ToolExecutor {
	private readonly concurrency: number;

	constructor(options: ToolExecutorOptions = {}) {
		this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
	}

	async executeAll(params: {
		calls: ToolCall[];
		tools: ToolRuntime;
		context: ToolExecutionContext;
		onResult?: (result: ToolResult) => void;
	}): Promise<ToolResult[]> {
		const results: ToolResult[] = new Array(params.calls.length);
		let cursor = 0;

		const worker = async () => {
			while (cursor < params.calls.length) {
				const index = cursor;
				cursor += 1;
				const call = params.calls[index];
				if (!call) continue;
				const result = await this.executeOne(call, params.tools, params.context);
				results[index] = result;
				params.onResult?.(result);
			}
		};

		const workers = Array.from(
			{ length: Math.min(this.concurrency, params.calls.length) },
			() => worker(),
		);
		await Promise.all(workers);
		return results.filter((result): result is ToolResult => Boolean(result));
	}

	private async executeOne(
		call: ToolCall,
		tools: ToolRuntime,
		context: ToolExecutionContext,
	): Promise<ToolResult> {
		const start = Date.now();
		try {
			if (context.signal?.aborted) {
				throw new Error("Tool execution cancelled before start");
			}
			const output = await tools.execute(call.name, call.arguments, context);
			return {
				callId: call.id,
				name: call.name,
				ok: true,
				content: stringifyToolOutput(output),
				durationMs: Date.now() - start,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				callId: call.id,
				name: call.name,
				ok: false,
				content: `Error executing ${call.name}: ${message}`,
				error: message,
				durationMs: Date.now() - start,
			};
		}
	}
}
