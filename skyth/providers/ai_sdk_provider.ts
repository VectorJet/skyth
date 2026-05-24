import { generateText, streamText, type ModelMessage } from "ai";
import {
	LLMProvider,
	type LLMResponse,
	type StreamCallback,
} from "@/providers/base";
import {
	findGateway,
	parseModelRef,
	resolveModelSDKInfo,
} from "@/providers/registry";
import { resolveSDK } from "@/providers/ai_sdk_resolver";
import {
	normalizeToolCallId,
	toMessages,
	toToolSet,
} from "@/providers/ai_sdk_provider_tools";
import {
	transformMessagesForProvider,
	transformRequestOptions,
} from "@/providers/opencode_provider_transform";
import {
	toolCallsFromResult,
	usageFromResult,
} from "@/providers/ai_sdk_response";
import type { AISDKProviderParams } from "@/providers/ai_sdk_provider_types";

export class AISDKProvider extends LLMProvider {
	private readonly defaultModel: string;
	private readonly providerName?: string;
	private readonly gateway;

	constructor(params: AISDKProviderParams = {}) {
		super(params.api_key, params.api_base);
		this.defaultModel = params.default_model ?? "anthropic/claude-opus-4-6";
		this.providerName = params.provider_name;
		this.gateway = params.provider_name
			? undefined
			: findGateway(params.provider_name, params.api_key, params.api_base);
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
		const slash = model.indexOf("/");
		if (slash !== -1) {
			const prefix = model.slice(0, slash).toLowerCase().replaceAll("-", "_");
			const selectedProvider =
				this.providerName ?? parseModelRef(this.defaultModel).providerID;
			if (prefix === selectedProvider) {
				return model.slice(slash + 1);
			}
		}

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

	private isTransientProviderError(message: string): boolean {
		const m = message.toLowerCase();
		return (
			this.isNoOutputError(message) ||
			m.includes("service unavailable") ||
			m.includes("temporarily unavailable") ||
			m.includes("timeout") ||
			m.includes("overloaded") ||
			m.includes("503") ||
			m.includes("502") ||
			m.includes("504")
		);
	}

	private async createSDK(resolvedModelID: string): Promise<any> {
		const providerID =
			this.providerName ?? parseModelRef(this.defaultModel).providerID;
		return resolveSDK(resolvedModelID, {
			apiKey: this.apiKey,
			apiBase: this.apiBase,
			defaultModel: this.defaultModel,
			providerID,
			gateway: this.gateway,
		});
	}

	getDebugInfo(): Record<string, unknown> {
		return {
			provider:
				this.providerName ?? parseModelRef(this.defaultModel).providerID,
			defaultModel: this.defaultModel,
			apiBase: this.apiBase ?? null,
			apiKeyConfigured: Boolean(this.apiKey),
			gateway: this.gateway?.name ?? null,
		};
	}

	private logProviderFailure(
		action: string,
		error: unknown,
		model: string,
	): string {
		const message =
			error instanceof Error ? error.message : "Provider request failed";
		console.warn("[provider] request failed", {
			action,
			...this.getDebugInfo(),
			model,
			error: message,
		});
		return message;
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
		const providerID =
			this.providerName ?? parseModelRef(this.defaultModel).providerID;
		const modelInfo = resolveModelSDKInfo(providerID, model);
		if (String(modelInfo?.status ?? "").toLowerCase() === "deprecated") {
			return {
				content: `Provider error: configured model "${this.defaultModel}" is deprecated in the models.dev catalog. Choose a current model for provider "${providerID}".`,
				tool_calls: [],
				finish_reason: "stop",
			};
		}
		const transformModel = { providerID, modelID: model, info: modelInfo };
		const messages = transformMessagesForProvider(
			this.toMessages(params.messages),
			transformModel,
		);
		const requestOptions = transformRequestOptions(transformModel, {
			tools: this.toToolSet(params.tools),
			temperature: params.temperature,
		});

		let sdk: any;
		try {
			sdk = await this.createSDK(model);
		} catch (error) {
			const message = this.logProviderFailure("resolve-sdk", error, model);
			return {
				content: `Provider error: ${message}`,
				tool_calls: [],
				finish_reason: "stop",
			};
		}

		if (params.stream) {
			return this.streamChat({
				sdk,
				messages,
				tools: requestOptions.tools,
				model,
				max_tokens: params.max_tokens,
				temperature: requestOptions.temperature,
				topP: requestOptions.topP,
				topK: requestOptions.topK,
				onStream: params.onStream,
			});
		}

		try {
			return await this.generateChat({
				sdk,
				messages,
				tools: requestOptions.tools,
				model,
				max_tokens: params.max_tokens,
				temperature: requestOptions.temperature,
				topP: requestOptions.topP,
				topK: requestOptions.topK,
			});
		} catch (error) {
			const message = this.logProviderFailure("generate", error, model);
			if (requestOptions.tools && this.isTransientProviderError(message)) {
				try {
					return await this.generateChat({
						sdk,
						messages: this.trimModelMessagesForRetry(messages),
						tools: undefined,
						model,
						max_tokens: params.max_tokens,
						temperature: requestOptions.temperature,
						topP: requestOptions.topP,
						topK: requestOptions.topK,
					});
				} catch (fallbackError) {
					this.logProviderFailure("generate-degraded", fallbackError, model);
				}
			}
			return {
				content: `Provider error: ${message}`,
				tool_calls: [],
				finish_reason: "stop",
			};
		}
	}

	private async generateChat(params: {
		sdk: any;
		messages: ModelMessage[];
		tools?: Record<string, unknown>;
		model: string;
		max_tokens?: number;
		temperature?: number;
		topP?: number;
		topK?: number;
	}): Promise<LLMResponse> {
		const result = await generateText({
			model: params.sdk(params.model),
			messages: params.messages,
			tools: params.tools as any,
			maxOutputTokens: params.max_tokens,
			temperature: params.temperature,
			topP: params.topP,
			topK: params.topK,
		});

		return {
			content: result.text,
			tool_calls: toolCallsFromResult(result.toolCalls),
			finish_reason: result.finishReason || "stop",
			usage: usageFromResult(result.usage),
		};
	}

	private trimModelMessagesForRetry(
		messages: ModelMessage[],
		keep = 14,
	): ModelMessage[] {
		if (messages.length <= keep + 1) return messages;
		const system = messages.filter((m) => m.role === "system");
		const nonSystem = messages.filter((m) => m.role !== "system");
		return [...system, ...nonSystem.slice(-keep)];
	}

	private async streamChat(params: {
		sdk: any;
		messages: ModelMessage[];
		tools?: Record<string, unknown>;
		model: string;
		max_tokens?: number;
		temperature?: number;
		topP?: number;
		topK?: number;
		onStream?: StreamCallback;
	}): Promise<LLMResponse> {
		const {
			sdk,
			messages,
			tools,
			model,
			max_tokens,
			temperature,
			topP,
			topK,
			onStream,
		} = params;

		try {
			const result = await streamText({
				model: sdk(model),
				messages,
				tools: tools as any,
				maxOutputTokens: max_tokens,
				temperature,
				topP,
				topK,
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

			const response: LLMResponse = {
				content: text,
				tool_calls: toolCallsFromResult(resolvedToolCalls as unknown[]),
				finish_reason: finishReason || "stop",
				reasoning_content: reasoningText ?? null,
				usage: usageFromResult(usage),
			};

			onStream?.({ type: "done", response });
			return response;
		} catch (error) {
			const message = this.logProviderFailure("stream", error, model);
			if (tools && this.isTransientProviderError(message)) {
				try {
					const fallback = await this.generateChat({
						sdk,
						messages: this.trimModelMessagesForRetry(messages),
						tools: undefined,
						model,
						max_tokens,
						temperature,
						topP,
						topK,
					});
					params.onStream?.({ type: "done", response: fallback });
					return fallback;
				} catch (fallbackError) {
					this.logProviderFailure("stream-degraded", fallbackError, model);
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
