import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { getServices } from "@/gateway/meta/tools/delegation_bridge.ts";

export const delegateTool: ToolDefinition = {
	name: "delegate",
	description: `Delegate a task to a subagent for parallel execution.

Use this when a task can be completed independently by a focused subagent with file-system access (read, write, edit, list, exec, fetch). The main agent continues while the subagent works in the background. Results are announced when the subagent completes.

Delegation depth is bounded to prevent runaway chains. Subagents cannot delegate further.

Examples:
- delegate({ task: "Find all TODO comments in the codebase" })
- delegate({ task: "Write unit tests for UserService", label: "test-user-service" })
- delegate({ task: "Research and summarise the Stripe API pagination docs" })`,
	parameters: [
		{
			name: "task",
			description:
				"Full description of the task the subagent should complete. Be as specific as possible about what constitutes success.",
			type: "string",
			required: true,
		},
		{
			name: "label",
			description:
				"Optional short human-readable label for the subagent (defaults to truncated task).",
			type: "string",
			required: false,
		},
	],
	handler: async (args) => {
		const { subagentManager, delegationController } = getServices();
		if (!subagentManager) {
			throw new Error(
				"SubagentManager not configured. Delegate tool requires a running agent runtime to delegate tasks.",
			);
		}
		const task = String(args.task ?? "").trim();
		if (!task) throw new Error("'task' is required");

		// Validate delegation is allowed from generalist tier
		const check = delegationController.canDelegate({
			caller: "generalist",
			callee: "subagent",
			callerTier: "generalist",
		});
		if (!check.allowed) {
			throw new Error(`Delegation blocked: ${check.reason}`);
		}

		// Track the delegation frame
		delegationController.push("delegate_tool", "generalist");

		try {
			const result = await subagentManager.spawn({
				task,
				label: String(args.label ?? "").trim() || undefined,
				originChannel: args._tabContext?.activeTab ?? "cli",
				originChatId: "gateway",
			});
			return {
				delegated: true,
				message: result,
				caller: "generalist",
				mode: "subagent",
			};
		} finally {
			delegationController.pop();
		}
	},
	metadata: {
		category: "meta",
		tags: ["delegation", "subagent", "parallel", "meta"],
		version: "1.0.0",
		author: "system",
		summary:
			"Spawn a background subagent to complete a task with file-system access",
		visibility: "suggested",
		triggerPhrases: [
			"delegate task",
			"spawn subagent",
			"offload work",
			"do this in the background",
			"parallel execution",
		],
		relatedTools: ["task", "batch_tools"],
		whenNotToUse: [
			"Task needs results before continuing (use task or inline tools instead)",
			"Task depends on the current runtime state",
		],
		commonUses: [
			"Research a topic while continuing the main conversation",
			"Run a long analysis in the background",
			"Explore code structure while asking a follow-up question",
		],
	},
};
