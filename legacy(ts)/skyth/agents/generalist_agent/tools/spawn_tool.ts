/**
 * @tool spawn
 * @author skyth-team
 * @version 1.0.0
 * @description Spawn a background subagent task and notify this conversation when complete.
 * @tags delegation
 */
import { defineTool } from "@/sdks/agent-sdk/tools";
import type { ToolExecutionContext } from "@/base/base_agent/tools/context";

export default defineTool({
	name: "spawn",
	description:
		"Spawn a background subagent task and notify this conversation when complete.",
	parameters: {
		type: "object",
		properties: {
			task: { type: "string" },
			label: { type: "string" },
		},
		required: ["task"],
	},
	async execute(
		params: Record<string, any>,
		ctx?: ToolExecutionContext,
	): Promise<string> {
		const task = String(params.task ?? "").trim();
		const label = params.label !== undefined ? String(params.label) : undefined;

		if (!task) return "Error: task is required";
		if (!ctx?.subagents) return "Error: Subagent manager not available";

		return await ctx.subagents.spawn({
			task,
			label,
			originChannel: ctx.channel ?? "cli",
			originChatId: ctx.chatId ?? "direct",
		});
	},
});
