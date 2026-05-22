import type { StreamEvent } from "@/providers/base";
import {
	MAX_PROVIDER_ERROR_RECOVERY_ATTEMPTS,
	degradedModeFallback,
	isProviderErrorContent,
	isRateLimitError,
	recoveryDelayMs,
	stripThink,
	toolResultFallback,
	ToolLoopPolicy,
} from "@/base/base_agent/runtime/policies";
import { ToolExecutor } from "@/base/base_agent/tools";
import type {
	StepRunEvent,
	StepRunnerInput,
	StepRunResult,
	ToolCall,
	ToolResult,
} from "@/base/base_agent/runtime/types";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function addAssistantMessage(
	messages: Array<Record<string, unknown>>,
	content: string | null,
	toolCalls: ToolCall[],
	reasoning?: string | null,
): Array<Record<string, unknown>> {
	return [
		...messages,
		{
			role: "assistant",
			content: content ?? "",
			...(toolCalls.length
				? {
						tool_calls: toolCalls.map((call) => ({
							id: call.id,
							type: "function",
							function: {
								name: call.name,
								arguments: JSON.stringify(call.arguments),
							},
							providerOptions: call.providerOptions,
						})),
					}
				: {}),
			...(reasoning ? { reasoning_content: reasoning } : {}),
		},
	];
}

function addToolResult(
	messages: Array<Record<string, unknown>>,
	result: ToolResult,
): Array<Record<string, unknown>> {
	return [
		...messages,
		{
			role: "tool",
			tool_call_id: result.callId,
			name: result.name,
			content: result.content,
		},
	];
}

function createStreamCollector(
	runId: string,
	stepIndex: number,
): { events: StepRunEvent[]; callback: (event: StreamEvent) => void } {
	const events: StepRunEvent[] = [];
	return {
		events,
		callback(event: StreamEvent) {
			if (event.type === "text-delta") {
				events.push({ type: "model_delta", runId, stepIndex, text: event.text });
			} else if (event.type === "reasoning-delta") {
				events.push({
					type: "reasoning_delta",
					runId,
					stepIndex,
					text: event.text,
				});
			}
		},
	};
}

export class StepRunner {
	constructor(private readonly toolExecutor = new ToolExecutor()) {}

	async *run(input: StepRunnerInput): AsyncIterable<StepRunEvent | StepRunResult> {
		let messages = input.messages;
		let finalContent: string | null = null;
		let finalReasoning: string | null = null;
		let finishReason = "stop";
		let usage: Record<string, number> | undefined;
		let providerErrorAttempts = 0;
		const toolsUsed: string[] = [];
		const toolResults: ToolResult[] = [];
		const loopPolicy = new ToolLoopPolicy();

		for (let stepIndex = 0; stepIndex < input.maxSteps; stepIndex += 1) {
			if (input.signal?.aborted) {
				finishReason = "cancelled";
				yield { type: "warning", runId: input.runId, message: "Run cancelled." };
				break;
			}

			yield { type: "step_start", runId: input.runId, stepIndex };
			const finalStep = stepIndex + 1 >= input.maxSteps;
			const stream = createStreamCollector(input.runId, stepIndex);
			let response;
			try {
				response = await input.provider.chat({
					messages,
					tools: finalStep ? undefined : input.tools.getDefinitions(),
					model: input.model,
					temperature: input.temperature,
					max_tokens: input.maxTokens,
					stream: true,
					onStream: stream.callback,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				response = {
					content: `Provider error: ${message}`,
					tool_calls: [],
					finish_reason: "stop",
				};
			}

			for (const event of stream.events) yield event;
			usage = response.usage ?? usage;
			finishReason = response.finish_reason || finishReason;
			if (response.reasoning_content) finalReasoning = response.reasoning_content;

			if (!response.tool_calls.length && isProviderErrorContent(response.content)) {
				providerErrorAttempts += 1;
				yield {
					type: "warning",
					runId: input.runId,
					message: String(response.content ?? "Provider error"),
				};
				const fallback = toolResultFallback(toolResults);
				if (fallback) {
					finalContent = fallback;
					break;
				}
				if (providerErrorAttempts < MAX_PROVIDER_ERROR_RECOVERY_ATTEMPTS) {
					if (isRateLimitError(response.content)) {
						await sleep(recoveryDelayMs(providerErrorAttempts));
					}
					messages = [
						...messages,
						{
							role: "system",
							content:
								"Provider recovery mode: continue with a concise direct reply, avoid tools unless strictly required.",
						},
					];
					continue;
				}
				finalContent = degradedModeFallback(messages);
				break;
			}
			providerErrorAttempts = 0;

			if (response.tool_calls.length) {
				const calls: ToolCall[] = response.tool_calls.map((call: ToolCall) => ({
					id: call.id,
					name: call.name,
					arguments: call.arguments,
					providerOptions: call.providerOptions,
				}));
				messages = addAssistantMessage(
					messages,
					response.content,
					calls,
					response.reasoning_content,
				);

				let repeated = false;
				for (const call of calls) {
					const loop = loopPolicy.record(call);
					if (loop.repeated) {
						yield {
							type: "loop_detected",
							runId: input.runId,
							stepIndex,
							signature: loop.signature,
						};
						finalContent = response.content ?? "Completed the requested actions.";
						repeated = true;
						break;
					}
					yield { type: "tool_call", runId: input.runId, stepIndex, call };
					toolsUsed.push(call.name);
				}
				if (repeated) break;

				const results = await this.toolExecutor.executeAll({
					calls,
					tools: input.tools,
					context: {
						threadId: input.threadId,
						runId: input.runId,
						agentId: input.agent.id,
						stepIndex,
						surface: input.surface,
						metadata: input.metadata,
						signal: input.signal,
					},
				});
				for (const result of results) {
					toolResults.push(result);
					messages = addToolResult(messages, result);
					yield {
						type: result.ok ? "tool_result" : "tool_error",
						runId: input.runId,
						stepIndex,
						result,
					};
				}
				yield {
					type: "step_finish",
					runId: input.runId,
					stepIndex,
					finishReason: "tool-calls",
					usage,
				};
				continue;
			}

			const candidate = stripThink(response.content);
			if (!candidate) {
				messages = [
					...messages,
					{
						role: "user",
						content: toolsUsed.length
							? "Final reply required: summarize completed actions for the user in 1-2 concise sentences. Do not call additional tools unless absolutely required."
							: "Final reply required: provide a concise direct reply to the user now.",
					},
				];
				continue;
			}
			finalContent = candidate;
			yield {
				type: "model_complete",
				runId: input.runId,
				stepIndex,
				text: finalContent,
			};
			yield {
				type: "step_finish",
				runId: input.runId,
				stepIndex,
				finishReason,
				usage,
			};
			break;
		}

		if (!finalContent && toolsUsed.length) {
			finalContent = "Done. Completed the requested updates.";
		}

		return {
			output: finalContent,
			messages,
			toolsUsed,
			reasoning: finalReasoning,
			finishReason,
			usage,
		} satisfies StepRunResult;
	}
}
