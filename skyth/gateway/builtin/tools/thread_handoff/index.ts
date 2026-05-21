import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { getMemoryStore } from "@/gateway/memory/store.ts";
import { getRuntime } from "@/gateway/channels/runtime.ts";
import type { WebChannel } from "@/gateway/channels/web/web-channel.ts";

function buildHandoffPrompt(args: {
	kind: "handoff" | "compaction";
	sourceThreadId: string;
	summary: string;
	nextPrompt?: string;
}) {
	const label = args.kind === "compaction" ? "COMPACTION" : "HANDOFF";
	const nextPrompt = args.nextPrompt?.trim()
		? args.nextPrompt.trim()
		: "Continue from the handoff summary above. First restate the immediate next steps, then proceed.";
	return `[GATEWAY | ${label}]
Continue this work from a previous Claude thread.

Source thread: ${args.sourceThreadId}

Handoff summary:
${args.summary}

Next prompt:
${nextPrompt}`;
}

export const threadHandoffTool: ToolDefinition = {
	name: "thread:handoff",
	description: `Persist a detailed handoff summary and start a new Claude thread from it.

Claude should call this after producing a compact but complete summary of goals, decisions, current state, changed files, open tasks, and the exact recommended next prompt. Normal handoff starts a background thread and keeps the current chat open. Compaction starts the new thread and switches the browser to it.`,
	parameters: [
		{
			name: "threadId",
			description:
				"Claude thread id. Accepts bare Claude UUID, claude:<uuid>, or current/latest.",
			type: "string",
			required: true,
		},
		{
			name: "summary",
			description: "Detailed handoff summary of the conversation so far.",
			type: "string",
			required: true,
		},
		{
			name: "nextPrompt",
			description: "Optional prompt to use in the next session.",
			type: "string",
			required: false,
		},
		{
			name: "title",
			description: "Optional handoff title.",
			type: "string",
			required: false,
		},
		{
			name: "metadata",
			description: "Optional structured metadata.",
			type: "object",
			required: false,
		},
		{
			name: "kind",
			description:
				"handoff starts a background thread; compaction starts and switches to the new thread.",
			type: "string",
			required: false,
			enum: ["handoff", "compaction"],
			default: "handoff",
		},
		{
			name: "switchToNew",
			description:
				"Override whether the browser should switch to the new thread. Defaults false for handoff and true for compaction.",
			type: "boolean",
			required: false,
		},
	],
	handler: async (args) => {
		const threadId = String(args.threadId ?? "").trim();
		const summary = String(args.summary ?? "").trim();
		if (!threadId) throw new Error("threadId is required");
		if (!summary) throw new Error("summary is required");
		const kind = args.kind === "compaction" ? "compaction" : "handoff";
		const handoff = await getMemoryStore().writeThreadHandoff({
			threadId,
			summary,
			nextPrompt:
				typeof args.nextPrompt === "string" ? args.nextPrompt : undefined,
			title: typeof args.title === "string" ? args.title : undefined,
			metadata: {
				...(args.metadata && typeof args.metadata === "object"
					? args.metadata
					: {}),
				kind,
			},
		});

		const prompt = buildHandoffPrompt({
			kind,
			sourceThreadId: handoff.threadId ?? threadId,
			summary,
			nextPrompt:
				typeof args.nextPrompt === "string" ? args.nextPrompt : undefined,
		});
		const switchToNew =
			typeof args.switchToNew === "boolean"
				? args.switchToNew
				: kind === "compaction";

		try {
			const web = getRuntime().channelManager.get("web") as
				| WebChannel
				| undefined;
			if (!web || typeof web.startThread !== "function") {
				return {
					...handoff,
					kind,
					switchToNew,
					startedThread: false,
					warning:
						"Web channel is unavailable; handoff was saved but no new Claude thread was started.",
				};
			}
			const started = await web.startThread(prompt, {
				kind,
				switchToNew,
				sourceThreadId: handoff.threadId ?? threadId,
				handoffId: handoff.handoffId,
			});
			return {
				...handoff,
				kind,
				switchToNew,
				startedThread: started.ok,
				newThreadId: started.threadId,
				newThreadUrl: started.url,
				error: started.error,
			};
		} catch (err) {
			return {
				...handoff,
				kind,
				switchToNew,
				startedThread: false,
				warning: `Handoff was saved but the new Claude thread was not confirmed: ${String((err as Error)?.message ?? err)}`,
			};
		}
	},
	metadata: {
		category: "memory",
		tags: ["thread", "session", "handoff", "compact", "claude"],
		version: "1.0.0",
		author: "system",
	},
};
