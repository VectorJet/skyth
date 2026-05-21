import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { getAllToolRuns } from "@/gateway/meta/tools/execute_tool.ts";

const DESCRIPTION = `Returns a history of recent tool executions in the current session.
Includes tool name, status (pending, running, completed, failed), duration, and any errors.
Use this to debug failed async runs or understand what just happened.
Supports filtering by status and limiting the number of results.`;

export const toolHistoryTool: ToolDefinition = {
	name: "tool_history",
	description: DESCRIPTION,
	parameters: [
		{
			name: "limit",
			description:
				"The maximum number of recent tool runs to return (defaults to 20)",
			type: "number",
			required: false,
			default: 20,
		},
		{
			name: "status",
			description: "Filter by status: pending, running, completed, failed",
			type: "string",
			required: false,
			enum: ["pending", "running", "completed", "failed"],
		},
	],
	handler: async (args) => {
		const { limit = 20, status } = args;

		let runs = getAllToolRuns();

		// Sort by startedAt descending (most recent first)
		runs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

		if (status) {
			runs = runs.filter((r) => r.status === status);
		}

		const recentRuns = runs.slice(0, limit).map((r) => ({
			runId: r.runId,
			tool: r.toolName,
			status: r.status,
			duration_ms: r.duration,
			error: r.error,
			startedAt: r.startedAt.toISOString(),
			completedAt: r.completedAt?.toISOString(),
			// Summarize input if it's small, otherwise just say [args]
			args:
				JSON.stringify(r.input).length < 200 ? r.input : "[large arguments]",
		}));

		return {
			count: recentRuns.length,
			total: runs.length,
			runs: recentRuns,
		};
	},
	examples: [
		{
			description: "Show recent failed tool runs",
			arguments: {
				status: "failed",
				limit: 5,
			},
		},
	],
	metadata: {
		category: "meta",
		tags: ["history", "debug", "execution", "status"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary: "Inspect recent tool executions and their statuses.",
			visibility: "suggested",
			triggerPhrases: [
				"tool history",
				"recent actions",
				"what tools ran",
				"debug tool execution",
				"execution history",
			],
			relatedTools: ["workspace_status", "changes_summary"],
			whenNotToUse: [
				"discovering available tools",
				"running a tool",
				"editing files",
			],
			commonUses: [
				"Review recent actions",
				"Debug failed tool calls",
				"Reconstruct workflow state",
			],
			followUps: ["find_tools", "workspace_status"],
			intentExamples: [
				"What did we run recently?",
				"Show failed tool executions",
			],
		},
	},
};
