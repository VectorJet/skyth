import {
	createAssistantMessageEventStream,
	streamSimple,
} from "@earendil-works/pi-ai";
import { parsePiModelRef } from "@/pi/model";
import { buildPiStreamCredentials } from "@/pi/credentials";
import { fromPiAssistantResponse } from "@/pi/events";
import type { AgentMessage, StreamFn } from "@earendil-works/pi-agent-core";
import { fromPiAssistantMessage } from "@/pi/messages";
import type { LLMProvider } from "@/pi/llm-provider";
import type { PluginManager } from "@/base/base_agent/plugin/manager";

export class AsyncQueue<T> implements AsyncIterable<T> {
	private queue: T[] = [];
	private resolvers: ((value: IteratorResult<T>) => void)[] = [];
	private closed = false;

	push(value: T) {
		if (this.closed) return;
		if (this.resolvers.length > 0) {
			const resolve = this.resolvers.shift();
			resolve?.({ value, done: false });
		} else {
			this.queue.push(value);
		}
	}

	close() {
		this.closed = true;
		while (this.resolvers.length > 0) {
			const resolve = this.resolvers.shift();
			resolve?.({ value: undefined as any, done: true });
		}
	}

	[Symbol.asyncIterator](): AsyncIterator<T> {
		return {
			next: async (): Promise<IteratorResult<T>> => {
				if (this.queue.length > 0) {
					return { value: this.queue.shift()!, done: false };
				}
				if (this.closed) {
					return { value: undefined as any, done: true };
				}
				return new Promise<IteratorResult<T>>((resolve) => {
					this.resolvers.push(resolve);
				});
			},
		};
	}
}

export function skythFinishToPiStop(reason: string): any {
	switch (reason) {
		case "stop":
			return "stop";
		case "length":
			return "length";
		case "tool_calls":
			return "toolUse";
		case "cancelled":
			return "aborted";
		case "error":
			return "error";
		default:
			return "stop";
	}
}

export function toSkythMessages(
	systemPrompt: string,
	messages: AgentMessage[],
): Array<Record<string, unknown>> {
	const out: Array<Record<string, unknown>> = [];
	if (systemPrompt) {
		out.push({ role: "system", content: systemPrompt });
	}
	for (const msg of messages) {
		if (!msg) continue;
		if (msg.role === "user") {
			out.push({
				role: "user",
				content:
					typeof msg.content === "string"
						? msg.content
						: msg.content
								.map((c) => (c.type === "text" ? c.text : ""))
								.join(""),
				timestamp: msg.timestamp,
			});
		} else if (msg.role === "assistant") {
			out.push(fromPiAssistantMessage(msg as any));
		} else if (msg.role === "toolResult") {
			out.push({
				role: "tool",
				name: msg.toolName,
				tool_call_id: msg.toolCallId,
				content: msg.content
					.map((c) => (c.type === "text" ? c.text : ""))
					.join(""),
				is_error: msg.isError,
				timestamp: msg.timestamp,
			});
		} else {
			out.push(msg as any);
		}
	}
	return out;
}

function toSkythToolDefinitions(
	tools: any[] | undefined,
): Array<Record<string, unknown>> {
	if (!Array.isArray(tools)) return [];
	return tools.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description ?? "",
			parameters: tool.parameters ?? {
				type: "object",
				properties: {},
				additionalProperties: false,
			},
		},
	}));
}

function toPiAssistantMessage(params: {
	response: Awaited<ReturnType<LLMProvider["chat"]>>;
	modelObj: { id?: string; provider?: string; name?: string };
}): any {
	const content: any[] = [];
	const reasoning = String(params.response.reasoning_content ?? "").trim();
	if (reasoning) {
		content.push({ type: "thinking", thinking: reasoning });
	}

	const text = String(params.response.content ?? "");
	if (text) {
		content.push({ type: "text", text });
	}

	for (const call of params.response.tool_calls ?? []) {
		const rawFunction = (call as any).function;
		let args = call.arguments ?? rawFunction?.arguments ?? {};
		if (typeof args === "string") {
			try {
				args = JSON.parse(args);
			} catch {
				args = { _raw: args };
			}
		}
		content.push({
			type: "toolCall",
			id: call.id,
			name: call.name ?? rawFunction?.name ?? "",
			arguments: args && typeof args === "object" ? args : { value: args },
		});
	}

	const parsed = parsePiModelRef(params.modelObj.id ?? "");
	return {
		role: "assistant",
		content,
		api: "skyth-llm-provider",
		provider: params.modelObj.provider ?? parsed.provider,
		model: parsed.model || params.modelObj.name || params.modelObj.id || "",
		usage: {
			input: Number(params.response.usage?.prompt_tokens ?? 0),
			output: Number(params.response.usage?.completion_tokens ?? 0),
			cacheRead: Number(params.response.usage?.cache_read_tokens ?? 0),
			cacheWrite: Number(params.response.usage?.cache_write_tokens ?? 0),
			totalTokens: Number(params.response.usage?.total_tokens ?? 0),
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: skythFinishToPiStop(params.response.finish_reason),
		timestamp: Date.now(),
	};
}

export function createStreamFn(params: {
	provider: LLMProvider | undefined;
	pluginManager: PluginManager | undefined;
	runId: string;
	threadId: string;
	getStepIndex: () => number;
	model: string;
	input: { surface?: string; metadata?: Record<string, unknown> };
}): StreamFn {
	return (modelObj, context, streamOptions) => {
		const engine = (params.provider as any)?.getEngine?.();
		const stepIndex = params.getStepIndex();
		if (engine) {
			const stream = createAssistantMessageEventStream();
			const parsed = parsePiModelRef(modelObj.id);
			const providerName =
				(params.provider as any).providerOverride ?? parsed.provider;
			const credentials = buildPiStreamCredentials(providerName);
			const headers = {
				...(credentials.headers ?? {}),
				...((params.provider as any).headers ?? {}),
				...(streamOptions?.headers ?? {}),
			};
			const apiKey =
				(params.provider as any).apiKey ??
				credentials.apiKey ??
				streamOptions?.apiKey;
			const apiBase = (params.provider as any).apiBase ?? credentials.apiBase;

			engine({
				provider: providerName,
				model: parsed.model,
				context,
				tools: context.tools,
				apiKey,
				apiBase,
				headers,
				temperature: streamOptions?.temperature,
				maxTokens: streamOptions?.maxTokens,
				signal: streamOptions?.signal,
				onEvent: (event: any) => {
					stream.push(event);
				},
			})
				.then(async ({ message }: any) => {
					if (params.pluginManager) {
						const skythResponse = fromPiAssistantResponse(
							message,
							message.stopReason,
						);
						const modifiedResponse = await params.pluginManager.applyPostModel(
							skythResponse as any,
							{
								runId: params.runId,
								threadId: params.threadId,
								stepIndex,
								model: params.model,
								surface: params.input.surface,
								metadata: params.input.metadata,
							},
						);
						const content: any[] = [];
						if (modifiedResponse.reasoning_content) {
							content.push({
								type: "thinking",
								thinking: String(modifiedResponse.reasoning_content),
							});
						}
						if (modifiedResponse.content) {
							content.push({
								type: "text",
								text: String(modifiedResponse.content),
							});
						}
						if (Array.isArray(modifiedResponse.tool_calls)) {
							for (const call of modifiedResponse.tool_calls) {
								content.push({
									type: "toolCall",
									id: call.id,
									name: call.name,
									arguments: call.arguments ?? {},
								});
							}
						}
						const updatedMessage = {
							...message,
							content,
							stopReason: skythFinishToPiStop(
								String(modifiedResponse.finish_reason ?? "stop"),
							),
						};
						stream.end(updatedMessage as any);
					} else {
						stream.end(message);
					}
				})
				.catch((err: any) => {
					stream.end({
						role: "assistant",
						content: [],
						stopReason: "error",
						errorMessage: err instanceof Error ? err.message : String(err),
					} as any);
				});
			return stream;
		}
		if (params.provider?.chat) {
			const stream = createAssistantMessageEventStream();
			const stepIndex = params.getStepIndex();
			const messages = toSkythMessages(
				context.systemPrompt ?? "",
				context.messages as any,
			);
			params.provider
				.chat({
					messages,
					tools: toSkythToolDefinitions(context.tools as any),
					model: params.model,
					max_tokens: streamOptions?.maxTokens,
					temperature: streamOptions?.temperature,
					stream: false,
				})
				.then(async (response) => {
					const modifiedResponse = params.pluginManager
						? await params.pluginManager.applyPostModel(response as any, {
								runId: params.runId,
								threadId: params.threadId,
								stepIndex,
								model: params.model,
								surface: params.input.surface,
								metadata: params.input.metadata,
							})
						: response;
					const message = toPiAssistantMessage({
						response: modifiedResponse as Awaited<
							ReturnType<LLMProvider["chat"]>
						>,
						modelObj: modelObj as any,
					});
					stream.push({
						type: "done",
						reason:
							message.stopReason === "toolUse"
								? "toolUse"
								: message.stopReason === "length"
									? "length"
									: "stop",
						message,
					} as any);
				})
				.catch((err) => {
					const message = {
						role: "assistant",
						content: [],
						api: "skyth-llm-provider",
						provider: String((modelObj as any).provider ?? ""),
						model: String((modelObj as any).id ?? params.model),
						usage: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 0,
							cost: {
								input: 0,
								output: 0,
								cacheRead: 0,
								cacheWrite: 0,
								total: 0,
							},
						},
						stopReason: "error",
						errorMessage: err instanceof Error ? err.message : String(err),
						timestamp: Date.now(),
					};
					stream.push({
						type: "error",
						reason: "error",
						error: message,
					} as any);
				});
			return stream;
		}
		try {
			return streamSimple(modelObj, context, streamOptions);
		} catch (err) {
			const stream = createAssistantMessageEventStream();
			stream.end({
				role: "assistant",
				content: [],
				stopReason: "error",
				errorMessage: err instanceof Error ? err.message : String(err),
			} as any);
			return stream;
		}
	};
}
