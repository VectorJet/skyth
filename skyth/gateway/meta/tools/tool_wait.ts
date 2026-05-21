import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { markToolRunWaitRequested } from "@/gateway/meta/tools/execute_tool.ts";

export const waitTool: ToolDefinition = {
	name: "wait",
	description: `Register interest in a running async tool and stop the current response.

Use this after execute_tool or find_tools returns a runId for work that may take a while. This marks the run for completion notification. After wait returns, end the response and do not call tool_watch for the same run. When the run finishes, the gateway sends a new message with the result or asks for tool_result if output is too large.`,
	parameters: [
		{
			name: "runId",
			description:
				"The run ID returned from execute_tool or find_tools with async=true",
			type: "string",
			required: true,
		},
		{
			name: "reason",
			description: "Optional short reason to include in the response guidance",
			type: "string",
			required: false,
		},
	],
	handler: async (args) => {
		const { runId, reason } = args;
		const run = markToolRunWaitRequested(runId);
		if (!run) throw new Error(`Run "${runId}" not found`);

		return {
			runId,
			status: run.status,
			tool: run.toolName,
			message:
				`Stop here and end the current response. Do not call tool_watch again for this run. ` +
				`The gateway will send a new message when runId ${runId} completes${reason ? ` (${reason})` : ""}.`,
		};
	},
	metadata: {
		category: "meta",
		tags: ["execution", "async", "wait", "meta"],
		version: "1.0.0",
		author: "system",
	},
};
