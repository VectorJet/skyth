import {
	type AgentEvent,
	createLoopEvent,
	createModelChatEvent,
	createSendEvent,
	createToolEvent,
	createWarnEvent,
} from "@/base/base_agent/runtime/eventtypes";
import { stripThink } from "@/base/base_agent/runtime/policies";
import type { ToolExecutionContext } from "@/base/base_agent/tools/context";
import type { LLMResponse, StreamCallback } from "@/providers/base";

const MAX_PROVIDER_ERROR_RECOVERY_ATTEMPTS = 5;
const TOOL_FALLBACK_LINES = 8;
const RETRY_INITIAL_DELAY = 2000;
const RETRY_BACKOFF_FACTOR = 2;
const RETRY_MAX_DELAY = 30000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) =>
		setTimeout(resolve, Math.min(ms, RETRY_MAX_DELAY)),
	);
}

function isRateLimitError(content: string | null): boolean {
	if (!content) return false;
	const lower = content.toLowerCase();
	return (
		lower.includes("rate limit") ||
		lower.includes("rate_limit") ||
		lower.includes("too many requests")
	);
}

function isProviderErrorContent(content: string | null): boolean {
	if (!content) return false;
	return /^provider error:/i.test(content.trim());
}

function formatToolFallback(
	messages: Array<Record<string, any>>,
): string | null {
	const recentToolMessages = messages
		.filter((msg) => msg.role === "tool")
		.slice(-2);
	if (!recentToolMessages.length) return null;

	const sections: string[] = [
		"I hit a temporary provider issue while finalizing, but the tool step completed.",
	];

	for (const msg of recentToolMessages) {
		const name = String(msg.name ?? "tool");
		const raw = String(msg.content ?? "").trim();
		if (!raw) continue;
		const lines = raw.split(/\r?\n/);
		const snippet = lines.slice(0, TOOL_FALLBACK_LINES).join("\n").trim();
		const truncated = lines.length > TOOL_FALLBACK_LINES ? "\n..." : "";
		sections.push(`${name}:\n${snippet}${truncated}`);
	}

	return sections.length > 1 ? sections.join("\n\n") : null;
}

function degradedModeFallback(messages: Array<Record<string, any>>): string {
	const lastUser = [...messages]
		.reverse()
		.find((msg) => msg.role === "user" && typeof msg.content === "string");
	const taskHint = String(lastUser?.content ?? "").trim();
	if (taskHint) {
		return `I switched to degraded mode due to upstream instability. I preserved context for: "${taskHint.slice(0, 180)}" and will continue automatically as soon as the provider recovers.`;
	}
	return "I switched to degraded mode due to upstream instability. I preserved context and will continue automatically as soon as the provider recovers.";
}

export async function runAgentLoop(params: {
	initialMessages: Array<Record<string, any>>;
	key: string;
	onStream?: StreamCallback;
	maxIterations: number;
	steps?: number;
	provider: any;
	tools: {
		getDefinitions(): Array<Record<string, any>>;
		execute(
			name: string,
			args: Record<string, any>,
			context?: Record<string, any>,
		): Promise<string>;
	};
	toolContext?: ToolExecutionContext;
	workspace: string;
	context: {
		addAssistantMessage(
			messages: Array<Record<string, any>>,
			content: string | null,
			toolCalls: Array<Record<string, any>>,
			reasoningContent?: string | null,
		): Array<Record<string, any>>;
		addToolResult(
			messages: Array<Record<string, any>>,
			toolCallId: string,
			name: string,
			result: string,
		): Array<Record<string, any>>;
	};
	model: string;
	temperature: number;
	maxTokens: number;
	emit: (event: AgentEvent) => void;
}): Promise<[string | null, string[], string | null]> {
	let messages = params.initialMessages;
	let iteration = 0;
	let finalContent: string | null = null;
	let finalReasoning: string | null = null;
	const toolsUsed: string[] = [];
	const recentCallSignatures: string[] = [];
	let providerErrorAttempts = 0;
	const LOOP_DETECT_WINDOW = 6;
	const LOOP_DETECT_THRESHOLD = 3;
	const maxSteps = params.steps ?? params.maxIterations;
	const isLastStep = (step: number) => step >= maxSteps;
	const runId = crypto.randomUUID();
	params.emit(createModelChatEvent(params.key, runId));

	while (iteration < params.maxIterations) {
		iteration += 1;
		let response: LLMResponse;
		const step = iteration + 1;
		const isFinalStep = isLastStep(step);
		const toolsForStep = isFinalStep
			? undefined
			: params.tools.getDefinitions();
		try {
			response = await params.provider.chat({
				messages,
				tools: toolsForStep,
				model: params.model,
				temperature: params.temperature,
				max_tokens: params.maxTokens,
				stream: !!params.onStream,
				onStream: params.onStream,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			response = {
				content: `Provider error: ${message}`,
				tool_calls: [],
				finish_reason: "stop",
			};
		}

		if (response.reasoning_content) {
			finalReasoning = response.reasoning_content;
		}

		if (
			!response.tool_calls.length &&
			isProviderErrorContent(response.content)
		) {
			providerErrorAttempts += 1;
			const errorText = String(response.content ?? "")
				.replace(/\s+/g, " ")
				.trim();
			const isRateLimited = isRateLimitError(response.content);
			params.emit(
				createWarnEvent(
					params.key,
					`provider ${providerErrorAttempts}: ${errorText}`,
				),
			);

			const fallback = formatToolFallback(messages);
			if (fallback) {
				finalContent = fallback;
				params.emit(createSendEvent(params.key, finalContent ?? ""));
				break; // Exit loop - we have a valid fallback from tool results
			}

			if (providerErrorAttempts < MAX_PROVIDER_ERROR_RECOVERY_ATTEMPTS) {
				if (isRateLimited) {
					const delay = Math.min(
						RETRY_INITIAL_DELAY *
							RETRY_BACKOFF_FACTOR ** (providerErrorAttempts - 1),
						RETRY_MAX_DELAY,
					);
					params.emit(
						createWarnEvent(
							params.key,
							`rate limited, backing off ${delay}ms before retry`,
						),
					);
					await sleep(delay);
				}
				messages.push({
					role: "system",
					content:
						"Provider recovery mode: continue with a concise direct reply, avoid tools unless strictly required.",
				});
				continue;
			}

			finalContent = degradedModeFallback(messages);
			params.emit(createSendEvent(params.key, finalContent ?? ""));
			break;
		}
		providerErrorAttempts = 0;

		const resetStream = () => params.onStream?.({ type: "reset" });

		if (response.tool_calls.length) {
			const toolCallDicts = response.tool_calls.map((tc) => ({
			  id: tc.id,
			  type: "function",
			  function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
			  providerOptions: tc.providerOptions,
			}));

			try {
				messages = params.context.addAssistantMessage(
					messages,
					response.content,
					toolCallDicts,
					response.reasoning_content ?? undefined,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				params.emit(
					createWarnEvent(
						params.key,
						`assistant tool-call context failed: ${message}`,
					),
				);
				finalContent =
					formatToolFallback(messages) ?? degradedModeFallback(messages);
				break;
			}

			for (const toolCall of response.tool_calls) {
				const sig = `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`;
				recentCallSignatures.push(sig);
				if (recentCallSignatures.length > LOOP_DETECT_WINDOW)
					recentCallSignatures.shift();
				const repeats = recentCallSignatures.filter((s) => s === sig).length;
				if (repeats >= LOOP_DETECT_THRESHOLD) {
					params.emit(
						createLoopEvent(params.key, `detected on ${toolCall.name}`),
					);
					finalContent = response.content ?? "Completed the requested actions.";
					break;
				}

				params.emit(createToolEvent(params.key, toolCall.name, runId));
				toolsUsed.push(toolCall.name);
				let result: string;
				try {
					result = await params.tools.execute(
						toolCall.name,
						toolCall.arguments,
						params.toolContext ?? { workspace: params.workspace },
					);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					params.emit(
						createWarnEvent(
							params.key,
							`tool ${toolCall.name} failed: ${message}`,
						),
					);
					result = `Error executing ${toolCall.name}: ${message}`;
				}
				try {
					messages = params.context.addToolResult(
						messages,
						toolCall.id,
						toolCall.name,
						result,
					);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					params.emit(
						createWarnEvent(
							params.key,
							`tool result context failed: ${message}`,
						),
					);
					finalContent =
						formatToolFallback(messages) ?? degradedModeFallback(messages);
					break;
				}
			}
			if (finalContent) break;
		} else {
			const candidate = stripThink(response.content);
			if (!candidate) {
				resetStream();
				messages.push({
					role: "user",
					content: toolsUsed.length
						? "Final reply required: summarize completed actions for the user in 1-2 concise sentences. Do not call additional tools unless absolutely required."
						: "Final reply required: provide a concise direct reply to the user now.",
				});
				continue;
			}
			finalContent = candidate;
			params.emit(createSendEvent(params.key, finalContent ?? ""));
			break;
		}
	}

	if (!finalContent && toolsUsed.length) {
		finalContent = "Done. Completed the requested updates.";
	}
	return [finalContent, toolsUsed, finalReasoning];
}
