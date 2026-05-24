import type { LLMResponse, StreamEvent, ToolCallRequest } from "@/providers/base";
import type {
	PiAssistantMessage,
	PiAssistantMessageEvent,
	PiStopReason,
} from "@/pi/types";

/**
 * Translate a Pi `AssistantMessageEvent` into zero or one Skyth `StreamEvent`.
 *
 * Returns `null` for Pi-only lifecycle events (`start`, `*_start`, `*_end`)
 * that have no Skyth counterpart. The terminal `done`/`error` events become a
 * `done` StreamEvent carrying a fully-formed `LLMResponse`.
 */
export function fromPiStreamEvent(
	event: PiAssistantMessageEvent,
): StreamEvent | null {
	switch (event.type) {
		case "text_delta":
			return { type: "text-delta", text: event.delta };
		case "thinking_delta":
			return { type: "reasoning-delta", text: event.delta };
		case "toolcall_end":
			return {
				type: "tool-call",
				toolCallId: event.toolCall.id,
				toolName: event.toolCall.name,
				args: JSON.stringify(event.toolCall.arguments ?? {}),
			};
		case "done":
			return {
				type: "done",
				response: fromPiAssistantResponse(event.message, event.reason),
			};
		case "error":
			return {
				type: "done",
				response: fromPiAssistantResponse(event.error, event.reason),
			};
		default:
			return null;
	}
}

/**
 * Convert a completed Pi `AssistantMessage` into Skyth's `LLMResponse`.
 */
export function fromPiAssistantResponse(
	message: PiAssistantMessage,
	stopReason: PiStopReason,
): LLMResponse {
	let text = "";
	let reasoning = "";
	const toolCalls: ToolCallRequest[] = [];

	for (const block of message.content) {
		if (block.type === "text") {
			text += block.text;
		} else if (block.type === "thinking") {
			reasoning += block.thinking;
		} else if (block.type === "toolCall") {
			toolCalls.push({
				id: block.id,
				name: block.name,
				arguments: block.arguments ?? {},
			});
		}
	}

	const usage = message.usage
		? {
				prompt_tokens: message.usage.input,
				completion_tokens: message.usage.output,
				total_tokens: message.usage.totalTokens,
				cache_read_tokens: message.usage.cacheRead,
				cache_write_tokens: message.usage.cacheWrite,
			}
		: undefined;

	return {
		content: text || (message.errorMessage ?? null),
		tool_calls: toolCalls,
		finish_reason: piStopToSkythFinish(stopReason),
		usage,
		reasoning_content: reasoning || null,
	};
}

function piStopToSkythFinish(reason: PiStopReason): string {
	switch (reason) {
		case "stop":
			return "stop";
		case "length":
			return "length";
		case "toolUse":
			return "tool_calls";
		case "aborted":
			return "cancelled";
		case "error":
			return "error";
		default:
			return "stop";
	}
}
