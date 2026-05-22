import type {
	ToolCall,
	ToolExecutionContext,
	ToolResult,
	ToolRuntime,
} from "@/base/base_agent/runtime/types";
import type { PluginManager } from "@/base/base_agent/plugin/manager";
import type { ToolHookContext } from "@/base/base_agent/plugin/types";

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
		pluginManager?: PluginManager;
	}): Promise<ToolResult[]> {
		const results: ToolResult[] = new Array(params.calls.length);
		let cursor = 0;

		const worker = async () => {
			while (cursor < params.calls.length) {
				const index = cursor;
				cursor += 1;
				const call = params.calls[index];
				if (!call) continue;
				const result = await this.executeOne(
					call,
					params.tools,
					params.context,
					params.pluginManager,
				);
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
		pluginManager?: PluginManager,
	): Promise<ToolResult> {
		const start = Date.now();

		// ── Pre-tool plugin hook ──
		let callArgs = call.arguments;
		if (pluginManager) {
			const toolCtx: ToolHookContext = {
				runId: context.runId,
				threadId: context.threadId,
				agentId: context.agentId,
				stepIndex: context.stepIndex,
				surface: context.surface,
				metadata: context.metadata as Record<string, unknown> | undefined,
			};
			const intercept = await pluginManager.applyPreTool(
				call.name,
				callArgs,
				toolCtx,
			);
			if (!intercept.proceed) {
				return {
					callId: call.id,
					name: call.name,
					ok: false,
					content: `Tool '${call.name}' blocked by plugin`,
					error: "blocked-by-plugin",
					durationMs: Date.now() - start,
				};
			}
			callArgs = intercept.args;
		}

		try {
			if (context.signal?.aborted) {
				throw new Error("Tool execution cancelled before start");
			}
			const output = await tools.execute(call.name, callArgs, context);
			const content = stringifyToolOutput(output);

			// ── Post-tool plugin hook ──
			if (pluginManager) {
				const toolCtx: ToolHookContext = {
					runId: context.runId,
					threadId: context.threadId,
					agentId: context.agentId,
					stepIndex: context.stepIndex,
					surface: context.surface,
					metadata: context.metadata as Record<string, unknown> | undefined,
				};
				await pluginManager.applyPostTool(
					call.name,
					callArgs,
					content,
					toolCtx,
				);
			}

			return {
				callId: call.id,
				name: call.name,
				ok: true,
				content,
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
