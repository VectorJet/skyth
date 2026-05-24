import type { LLMResponse } from "@/providers/base";
import {
	normalizeToolCallId,
	parseToolArguments,
} from "@/providers/ai_sdk_provider_tools";

export function toolCallsFromResult(
	toolCalls: unknown[] | undefined,
): LLMResponse["tool_calls"] {
	return (toolCalls ?? []).map((call, index) => {
		const item = call as {
			toolCallId: unknown;
			toolName: string;
			input: unknown;
			providerOptions?: Record<string, any>;
		};
		return {
			id: normalizeToolCallId(item.toolCallId, `call_${index + 1}`),
			name: item.toolName,
			arguments: parseToolArguments(item.input),
			providerOptions: item.providerOptions,
		};
	});
}

export function usageFromResult(
	usage: { inputTokens?: number; outputTokens?: number } | undefined,
): LLMResponse["usage"] {
	if (!usage) return undefined;
	return {
		input_tokens: usage.inputTokens ?? 0,
		output_tokens: usage.outputTokens ?? 0,
		total_tokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
	};
}
