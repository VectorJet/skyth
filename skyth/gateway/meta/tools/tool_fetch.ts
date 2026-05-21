import { getMemoryStore } from "@/gateway/memory/store.ts";
import { chatGptResultUrl } from "@/gateway/meta/tools/search.ts";

export const chatGptFetchTool = {
	name: "tool_fetch",
	description:
		"Fetch a full indexed Claude Gateway conversation by ID returned from search.",
	inputSchema: {
		type: "object",
		properties: {
			id: {
				type: "string",
				description: "Result ID returned from search.",
			},
		},
		required: ["id"],
	},
	outputSchema: {
		type: "object",
		properties: {
			id: { type: "string" },
			title: { type: "string" },
			text: { type: "string" },
			url: { type: "string" },
			metadata: { type: "object" },
		},
		required: ["id", "title", "text", "url"],
	},
};

export async function handleChatGptFetch(args: Record<string, any>) {
	const id = String(args.id ?? "").trim();
	if (!id) throw new Error("id is required");

	const thread = getMemoryStore().readThread({
		threadId: id,
		mode: "all",
		maxCharsPerMessage: Number(
			process.env.CLAUDE_GATEWAY_CHATGPT_FETCH_MAX_CHARS_PER_MESSAGE ?? 12000,
		),
	});

	const text = thread.messages
		.map((message) => {
			const timestamp = message.createdAt ? ` ${message.createdAt}` : "";
			return `[${message.index}] ${message.sender}${timestamp}\n${message.text}`;
		})
		.join("\n\n");

	return {
		id: thread.threadId,
		title: thread.title,
		text,
		url: chatGptResultUrl(thread.threadId),
		metadata: {
			provider: "claude",
			conversationId: thread.conversationId,
			summary: thread.summary,
			createdAt: thread.createdAt,
			updatedAt: thread.updatedAt,
			totalMessages: thread.totalMessages,
			returnedMessages: thread.returnedMessages,
		},
	};
}
