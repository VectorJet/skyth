import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import {
	formatCompletedToolResult,
	getToolOrPipelineRun,
} from "@/gateway/meta/tools/execute_tool.ts";

export const toolWatchTool: ToolDefinition = {
	name: "tool_watch",
	description: `Poll a running tool execution until it completes or fails.

Use this only for short async runs where the result is needed before responding. For long-running work, prefer wait({ runId }) and end the current response so the gateway can notify on completion. Use tool_result({ runId }) for a non-blocking status check.`,
	parameters: [
		{
			name: "runId",
			description:
				"The run ID returned from execute_tool or find_tools with async=true",
			type: "string",
			required: true,
		},
		{
			name: "timeout",
			description:
				"Maximum time to wait in milliseconds (default: 300000 = 5 minutes)",
			type: "number",
			required: false,
		},
		{
			name: "pollInterval",
			description:
				"How often to check status in milliseconds (default: 1000 = 1 second)",
			type: "number",
			required: false,
		},
	],
	handler: async (args) => {
		const { runId, timeout = 300000, pollInterval = 1000 } = args;
		const startTime = Date.now();

		while (true) {
			const found = getToolOrPipelineRun(runId);
			if (!found) throw new Error(`Run "${runId}" not found`);

			const { run, effectiveName } = found;
			if (run.status === "completed") {
				return formatCompletedToolResult(
					effectiveName,
					run.output,
					run.duration,
				);
			}

			if (run.status === "failed") {
				throw new Error(`Execution failed: ${run.error}`);
			}

			if (Date.now() - startTime > timeout) {
				throw new Error(
					`Execution timed out after ${timeout}ms (status: ${run.status})`,
				);
			}

			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}
	},
	metadata: {
		category: "meta",
		tags: ["execution", "async", "watch", "poll", "meta"],
		version: "1.0.0",
		author: "system",
	},
};
