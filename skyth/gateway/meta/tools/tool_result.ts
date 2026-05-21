import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import {
	formatCompletedToolResult,
	getToolOrPipelineRun,
} from "@/gateway/meta/tools/execute_tool.ts";

export const toolResultTool: ToolDefinition = {
	name: "tool_result",
	description: `Check the current status or completed result of an async tool run without blocking.

Use this when you already have a runId and want a manual status check. If the run is completed, the result is returned. If it is still pending/running, only status metadata is returned.`,
	parameters: [
		{
			name: "runId",
			description:
				"The run ID returned from execute_tool or find_tools with async=true",
			type: "string",
			required: true,
		},
	],
	handler: async (args) => {
		const { runId } = args;
		const found = getToolOrPipelineRun(runId);
		if (!found) throw new Error(`Run "${runId}" not found`);

		const { run, effectiveName } = found;
		if (run.status === "completed") {
			return formatCompletedToolResult(effectiveName, run.output, run.duration);
		}

		return {
			runId: run.runId,
			tool: effectiveName,
			status: run.status,
			startedAt: run.startedAt,
			completedAt: run.completedAt,
			duration: run.duration,
			error: run.error,
		};
	},
	metadata: {
		category: "meta",
		tags: ["execution", "async", "result", "status", "meta"],
		version: "1.0.0",
		author: "system",
	},
};
