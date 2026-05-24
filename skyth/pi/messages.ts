import type {
	PiAssistantMessage,
	PiContext,
	PiMessage,
	PiTextContent,
	PiToolCall,
	PiToolResultMessage,
	PiUserMessage,
} from "@/pi/types";

type SkythMessage = Record<string, unknown>;

interface SkythAssistantToolCall {
	id: string;
	type?: string;
	function: { name: string; arguments: string };
	providerOptions?: Record<string, unknown>;
}

function asString(value: unknown): string {
	if (value == null) return "";
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function parseArguments(raw: string): Record<string, unknown> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return { value: parsed };
	} catch {
		return { _raw: raw };
	}
}

function timestamp(message: SkythMessage): number {
	const raw = message.timestamp;
	if (typeof raw === "number" && Number.isFinite(raw)) return raw;
	return Date.now();
}

/**
 * Convert Skyth OpenAI-style messages into a Pi `Context`.
 *
 * - All `system` messages collapse into `Context.systemPrompt`
 *   (joined with blank lines).
 * - `assistant.tool_calls` become Pi `ToolCall` content blocks.
 * - `assistant.reasoning_content` becomes a Pi `ThinkingContent` block.
 * - `role: "tool"` becomes a Pi `ToolResultMessage`.
 *
 * Unknown roles are dropped with their content preserved as a `user` message
 * to avoid silent information loss.
 */
export function toPiContext(messages: SkythMessage[]): PiContext {
	const systemParts: string[] = [];
	const out: PiMessage[] = [];

	for (const message of messages) {
		const role = String(message.role ?? "");
		if (role === "system") {
			const text = asString(message.content).trim();
			if (text) systemParts.push(text);
			continue;
		}
		if (role === "user") {
			const userMessage: PiUserMessage = {
				role: "user",
				content: asString(message.content),
				timestamp: timestamp(message),
			};
			out.push(userMessage);
			continue;
		}
		if (role === "assistant") {
			out.push(skythAssistantToPi(message));
			continue;
		}
		if (role === "tool") {
			out.push(skythToolToPi(message));
			continue;
		}
		out.push({
			role: "user",
			content: asString(message.content),
			timestamp: timestamp(message),
		});
	}

	return {
		systemPrompt: systemParts.length ? systemParts.join("\n\n") : undefined,
		messages: out,
	};
}

function skythAssistantToPi(message: SkythMessage): PiAssistantMessage {
	const content: PiAssistantMessage["content"] = [];

	const reasoning = asString(message.reasoning_content).trim();
	if (reasoning) {
		content.push({ type: "thinking", thinking: reasoning });
	}

	const text = asString(message.content).trim();
	if (text) {
		const textBlock: PiTextContent = { type: "text", text };
		content.push(textBlock);
	}

	const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
	for (const raw of rawCalls as SkythAssistantToolCall[]) {
		const toolCall: PiToolCall = {
			type: "toolCall",
			id: String(raw.id ?? ""),
			name: String(raw.function?.name ?? ""),
			arguments: parseArguments(raw.function?.arguments ?? ""),
		};
		content.push(toolCall);
	}

	return {
		role: "assistant",
		content,
		api: String(message.api ?? ""),
		provider: String(message.provider ?? ""),
		model: String(message.model ?? ""),
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: timestamp(message),
	};
}

function skythToolToPi(message: SkythMessage): PiToolResultMessage {
	const content: PiTextContent[] = [
		{ type: "text", text: asString(message.content) },
	];
	return {
		role: "toolResult",
		toolCallId: String(message.tool_call_id ?? ""),
		toolName: String(message.name ?? ""),
		content,
		isError: Boolean(message.is_error),
		timestamp: timestamp(message),
	};
}

/**
 * Convert a single Pi `AssistantMessage` back to Skyth's OpenAI-style
 * assistant message. Used after a Pi turn so the existing Skyth message
 * history append paths stay unchanged.
 */
export function fromPiAssistantMessage(
	message: PiAssistantMessage,
): SkythMessage {
	let textContent = "";
	let reasoningContent = "";
	const toolCalls: SkythAssistantToolCall[] = [];

	for (const block of message.content) {
		if (block.type === "text") {
			textContent += block.text;
		} else if (block.type === "thinking") {
			reasoningContent += block.thinking;
		} else if (block.type === "toolCall") {
			toolCalls.push({
				id: block.id,
				type: "function",
				function: {
					name: block.name,
					arguments: JSON.stringify(block.arguments ?? {}),
				},
			});
		}
	}

	const out: SkythMessage = {
		role: "assistant",
		content: textContent,
		timestamp: message.timestamp,
	};
	if (toolCalls.length) out.tool_calls = toolCalls;
	if (reasoningContent) out.reasoning_content = reasoningContent;
	return out;
}
