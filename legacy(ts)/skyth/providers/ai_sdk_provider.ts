import { generateText, streamText, type ModelMessage } from "ai";
import {
	LLMProvider,
	type LLMResponse,
	type StreamCallback,
} from "@/providers/base";
import { findByModel, findGateway, parseModelRef } from "@/providers/registry";
import { resolveSDK } from "@/providers/ai_sdk_resolver";
import {
	normalizeToolCallId,
	parseToolArguments,
	toMessages,
	toToolSet,
} from "@/providers/ai_sdk_provider_tools";
import type { AISDKProviderParams } from "@/providers/ai_sdk_provider_types";

export class AISDKProvider extends LLMProvider {
	private readonly defaultModel: string;
	private readonly gateway;

	constructor(params: AISDKProviderParams = {}) {
		super(params.api_key, params.api_base);
		this.defaultModel = params.default_model ?? "anthropic/claude-opus-4-6";
		this.gateway = findGateway(
			params.provider_name,
			params.api_key,
			params.api_base,
		);
	}

	canonicalizeExplicitPrefix(
		model: string,
		specName: string,
		canonicalPrefix: string,
	): string {
		const slash = model.indexOf("/");
		if (slash === -1) return model;
		const prefix = model.slice(0, slash);
		const rest = model.slice(slash + 1);
		if (prefix.toLowerCase().replaceAll("-", "_") !== specName) return model;
		return `${canonicalPrefix}/${rest}`;
	}

	resolveModel(model: string): string {
		if (this.gateway) {
			const prefix = this.gateway.model_prefix ?? "";
			const routed = this.gateway.strip_model_prefix
				? (model.split("/").at(-1) ?? model)
				: model;
			return prefix && !routed.startsWith(`${prefix}/`)
				? `${prefix}/${routed}`
				: routed;
		}

		const spec = findByModel(model);
		if (spec?.model_prefix) {
			const canonical = this.canonicalizeExplicitPrefix(
				model,
				spec.name,
				spec.model_prefix,
			);
			const skip = spec.skip_prefixes ?? [];
			if (!skip.some((p) => canonical.startsWith(p)))
				return `${spec.model_prefix}/${canonical}`;
			return canonical;
		}

		if (spec) {
			const slash = model.indexOf("/");
			if (slash !== -1) {
				const prefix = model.slice(0, slash).toLowerCase().replaceAll("-", "_");
				if (prefix === spec.name) return model.slice(slash + 1);
			}
		}

		const { providerID, modelID } = parseModelRef(model);
		const defaultProvider = parseModelRef(this.defaultModel).providerID;
		if (providerID === defaultProvider && modelID) return modelID;

		return model;
	}

	toMessages(messages: Array<Record<string, unknown>>): ModelMessage[] {
		return toMessages(messages);
	}

	toToolSet(
		tools?: Array<Record<string, unknown>>,
	): Record<string, unknown> | undefined {
		return toToolSet(tools);
	}

	private isNoOutputError(message: string): boolean {
		const m = message.toLowerCase();
		return (
			m.includes("no output generated") ||
			m.includes("no output specified") ||
			m.includes("failed after 3 attempts")
		);
	}

	private trimMessagesForRetry(
		messages: Array<Record<string, unknown>>,
		keep = 14,
	): Array<Record<string, unknown>> {
		if (messages.length <= keep + 1) return messages;
		const system = messages.filter((m) => String(m?.role ?? "") === "system");
		const nonSystem = messages.filter(
			(m) => String(m?.role ?? "") !== "system",
		);
		const trimmed = nonSystem.slice(-keep);
		return [...system, ...trimmed];
	}

	private async createSDK(resolvedModelID: string): Promise<any> {
		return resolveSDK(resolvedModelID, {
			apiKey: this.apiKey,
			apiBase: this.apiBase,
			defaultModel: this.defaultModel,
			gateway: this.gateway,
		});
	}

	async chat(params: {
		messages: Array<Record<string, unknown>>;
		tools?: Array<Record<string, unknown>>;
		model?: string;
		max_tokens?: number;
		temperature?: number;
		stream?: boolean;
		onStream?: StreamCallback;
	}): Promise<LLMResponse> {
		const model = this.resolveModel(params.model ?? this.defaultModel);
		const messages = this.toMessages(params.messages);
		const tools = this.toToolSet(params.tools);

		const sdk = await this.createSDK(model);

		if (params.stream) {
			return this.streamChat({
				sdk,
				messages,
				tools,
				model,
				max_tokens: params.max_tokens,
				temperature: params.temperature,
				onStream: params.onStream,
			});
		}

		try {
			const result = await generateText({
				model: sdk(model),
				messages,
				tools: tools as any,
				maxOutputTokens: params.max_tokens,
				temperature: params.temperature,
			});

			const toolCalls = (result.toolCalls ?? []).map((call, index) => ({
				id: normalizeToolCallId(call.toolCallId, `call_${index + 1}`),
				name: call.toolName,
				arguments: parseToolArguments(call.input),
				providerOptions: (call as any).providerOptions,
			}));

			return {
				content: result.text,
				tool_calls: toolCalls,
				finish_reason: result.finishReason || "stop",
				usage: result.usage
					? {
							input_tokens: result.usage.inputTokens ?? 0,
							output_tokens: result.usage.outputTokens ?? 0,
							total_tokens:
								(result.usage.inputTokens ?? 0) +
								(result.usage.outputTokens ?? 0),
						}
					: undefined,
			};
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Provider request failed";
			return {
				content: `Provider error: ${message}`,
				tool_calls: [],
				finish_reason: "stop",
			};
		}
	}

	private async streamChat(params: {
		sdk: any;
		messages: ModelMessage[];
		tools?: Record<string, unknown>;
		model: string;
		max_tokens?: number;
		temperature?: number;
		onStream?: StreamCallback;
	}): Promise<LLMResponse> {
		const { sdk, messages, tools, model, max_tokens, temperature, onStream } =
			params;

		try {
			const result = await streamText({
				model: sdk(model),
				messages,
				tools: tools as any,
				maxOutputTokens: max_tokens,
				temperature,
				onFinish: () => {},
			});

			for await (const chunk of result.fullStream) {
				if (chunk.type === "text-delta") {
					onStream?.({ type: "text-delta", text: chunk.text });
				} else if (chunk.type === "reasoning-delta") {
					onStream?.({ type: "reasoning-delta", text: chunk.text });
				} else if (chunk.type === "tool-call") {
					onStream?.({
						type: "tool-call",
						toolCallId: normalizeToolCallId(
							(chunk as any).toolCallId ?? (chunk as any).id,
							"call_stream",
						),
						toolName: chunk.toolName,
						args: JSON.stringify(chunk.input ?? {}),
					});
				} else if (chunk.type === "tool-result") {
					onStream?.({
						type: "tool-result",
						toolCallId: normalizeToolCallId(
							(chunk as any).toolCallId ?? (chunk as any).id,
							"call_result",
						),
						result: (chunk as any).output,
					});
				}
			}

			const [text, finishReason, usage, resolvedToolCalls, reasoningText] =
				await Promise.all([
					result.text,
					result.finishReason,
					result.usage,
					result.toolCalls,
					(result as unknown as { reasoningText?: string }).reasoningText,
				]);

			const toolCalls = (resolvedToolCalls ?? []).map(
				(call: unknown, index: number) => {
					const c = call as {
						toolCallId: unknown;
						toolName: string;
						input: unknown;
						providerOptions?: Record<string, any>;
					};
					return {
						id: normalizeToolCallId(c.toolCallId, `call_${index + 1}`),
						name: c.toolName,
						arguments: parseToolArguments(c.input),
						providerOptions: c.providerOptions,
					};
				},
			);

			const response: LLMResponse = {
				content: text,
				tool_calls: toolCalls,
				finish_reason: finishReason || "stop",
				reasoning_content: reasoningText ?? null,
				usage: usage
					? {
							input_tokens: usage.inputTokens ?? 0,
							output_tokens: usage.outputTokens ?? 0,
							total_tokens:
								(usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
						}
					: undefined,
			};

			onStream?.({ type: "done", response });
			return response;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Provider request failed";
			if (this.isNoOutputError(message)) {
				try {
					const fallback = await this.chat({
						messages: this.trimMessagesForRetry(
							params.messages as unknown as Array<Record<string, unknown>>,
						),
						tools: undefined,
						model: params.model,
						max_tokens: params.max_tokens,
						temperature: params.temperature,
					});
					params.onStream?.({ type: "done", response: fallback });
					return fallback;
				} catch {
					// fall through
				}
			}
			const response: LLMResponse = {
				content: `Provider error: ${message}`,
				tool_calls: [],
				finish_reason: "stop",
			};
			params.onStream?.({ type: "done", response });
			return response;
		}
	}

	getDefaultModel(): string {
		return this.defaultModel;
	}
}
