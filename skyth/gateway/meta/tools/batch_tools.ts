import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { executeToolDirect } from "@/gateway/meta/tools/execute_tool.ts";

export interface BatchCall {
	id?: string;
	tool: string;
	args?: Record<string, any>;
}

export interface BatchRunOptions {
	concurrency?: number;
	tabContext?: any;
}

async function mapLimit<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from(
		{ length: Math.min(concurrency, items.length) },
		async () => {
			while (true) {
				const index = next++;
				if (index >= items.length) return;
				const item = items[index];
				if (item !== undefined) {
					results[index] = await fn(item, index);
				}
			}
		},
	);
	await Promise.all(workers);
	return results;
}

export async function runBatchTools(
	calls: BatchCall[],
	options: BatchRunOptions = {},
) {
	if (!Array.isArray(calls)) throw new Error("calls must be an array");
	if (calls.length === 0) return { results: [], duration: 0 };
	if (calls.length > 64)
		throw new Error("batch_tools supports at most 64 calls per batch");

	const concurrency = Math.max(
		1,
		Math.min(
			16,
			typeof options.concurrency === "number"
				? Math.floor(options.concurrency)
				: 8,
		),
	);
	const startedAt = Date.now();

	const results = await mapLimit(calls, concurrency, async (call, index) => {
		const id = call.id ?? String(index);
		const tool = String(call.tool ?? "").trim();
		const toolArgs =
			call.args && typeof call.args === "object" ? call.args : {};
		const callStartedAt = Date.now();

		if (!tool) {
			return {
				id,
				ok: false,
				error: "tool is required",
				args: toolArgs,
				duration: Date.now() - callStartedAt,
			};
		}

		try {
			if (tool === "batch_tools") {
				throw new Error("batch_tools cannot call itself");
			}

			const output = await executeToolDirect(tool, toolArgs, {
				tabContext: options.tabContext,
			});
			if (
				output &&
				typeof output === "object" &&
				typeof output.error === "string"
			) {
				return {
					id,
					tool,
					ok: false,
					error: output.error,
					output,
					args: toolArgs,
					duration: Date.now() - callStartedAt,
				};
			}
			return {
				id,
				tool,
				ok: true,
				output,
				duration: Date.now() - callStartedAt,
			};
		} catch (error: any) {
			return {
				id,
				tool,
				ok: false,
				error: error?.message || String(error),
				args: toolArgs,
				duration: Date.now() - callStartedAt,
			};
		}
	});

	return { results, duration: Date.now() - startedAt };
}

export const batchToolsTool: ToolDefinition = {
	name: "batch_tools",
	description: `Run multiple independent gateway tool calls in one request with bounded parallelism.

Use this when several tool calls do not depend on each other, especially multiple reads, globs, greps, find_tools queries, or other inspection calls. Results preserve input order and include each call's dynamic tool output. Do not use this when later calls need earlier outputs. Recursive batch_tools calls are rejected.

For long batches, call execute_tool({ tool: "batch_tools", args: { calls: [...] }, async: true }) and then wait with the returned runId.`,
	parameters: [
		{
			name: "calls",
			description:
				"Array of tool calls to run. Each call has optional id, tool, and args.",
			type: "array",
			required: true,
			items: {
				name: "call",
				description: "Individual tool call",
				type: "object",
				properties: {
					id: {
						name: "id",
						type: "string",
						description: "Optional stable identifier for this call",
					},
					tool: {
						name: "tool",
						type: "string",
						description: "Tool name. Supports pipeline: and mcp: prefixes.",
					},
					args: {
						name: "args",
						type: "object",
						description: "Arguments for this tool call",
					},
				},
				required: true,
			},
		},
		{
			name: "concurrency",
			description: "Maximum calls to run at once. Defaults to 8, max 16.",
			type: "number",
			required: false,
		},
		{
			name: "async",
			description:
				'Reserved for direct calls. For async batch execution, call execute_tool with tool="batch_tools" and async=true; that returns one aggregate runId.',
			type: "boolean",
			required: false,
		},
	],
	handler: async (args) => {
		const calls = Array.isArray(args.calls)
			? (args.calls as BatchCall[])
			: null;
		if (!calls) throw new Error("calls must be an array");
		if (args.async === true) {
			throw new Error(
				'Direct batch_tools does not start async runs. Use execute_tool with tool="batch_tools" and async=true for one aggregate runId.',
			);
		}
		return await runBatchTools(calls, {
			concurrency: args.concurrency,
			tabContext: args._tabContext,
		});
	},
	metadata: {
		category: "meta",
		tags: ["batch", "parallel", "execution", "meta"],
		version: "1.0.0",
		author: "system",
	},
};
