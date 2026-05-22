import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { getServices } from "@/gateway/meta/tools/delegation_bridge.ts";

export const taskTool: ToolDefinition = {
	name: "task",
	description: `Execute a focused task with file-system tools and return a task ID for tracking.

Use this for tasks that need a dedicated, focused subagent with file read/write/edit, terminal execution, and web-fetch capabilities. Unlike delegate, task runs inline and returns the result to the current tool call.

The task subagent has access to: read_file, write_file, edit_file, list_dir, exec, web_fetch.

Examples:
- task({ description: "Search the codebase for all usages of the UserService class and summarise them" })
- task({ description: "Create a new React component called UserAvatar with loading and error states" })
- task({ description: "Run the test suite for the auth module and report failures" })`,
	parameters: [
		{
			name: "task",
			description:
				"Full description of the task to execute. Be as specific as possible including success criteria.",
			type: "string",
			required: true,
		},
		{
			name: "label",
			description:
				"Optional short label for tracking. Defaults to a truncated task description.",
			type: "string",
			required: false,
		},
	],
	handler: async (args) => {
		const { subagentManager, delegationController } = getServices();
		if (!subagentManager) {
			throw new Error(
				"SubagentManager not configured. Task tool requires a running agent runtime to execute tasks.",
			);
		}
		const task = String(args.task ?? "").trim();
		if (!task) throw new Error("'task' is required");

		// Validate delegation is allowed
		const check = delegationController.canDelegate({
			caller: "generalist",
			callee: "subagent",
			callerTier: "generalist",
		});
		if (!check.allowed) {
			throw new Error(`Task execution blocked: ${check.reason}`);
		}

		delegationController.push("task_tool", "generalist");

		try {
			const result = await subagentManager.executeInline({
				task,
				label: String(args.label ?? "").trim() || undefined,
			});
			return {
				mode: "task",
				taskId: result.taskId,
				label: result.label,
				result: result.result,
			};
		} finally {
			delegationController.pop();
		}
	},
	metadata: {
		category: "meta",
		tags: ["task", "execution", "meta"],
		version: "1.0.0",
		author: "system",
		summary:
			"Execute a focused subtask with file-system access and track the result",
		visibility: "suggested",
		triggerPhrases: [
			"run a task",
			"execute a focused task",
			"do this specific thing",
			"subtask",
			"inline subtask",
		],
		relatedTools: ["delegate", "batch_tools", "find_tools"],
		whenNotToUse: [
			"Task can run fully in the background without awaiting its result (use delegate instead)",
			"Task is trivially simple and can be done with direct tools",
		],
		commonUses: [
			"Code research: find and summarise usages of a function or class",
			"File generation: create a new file with specific content",
			"Test analysis: run tests and report failures",
		],
	},
};
