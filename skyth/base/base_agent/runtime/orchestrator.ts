import { GeneralistAgent } from "@/base/base_agent";
import type { RunEvent, RunEventSink } from "@/core/events";
import type { LLMProvider } from "@/pi/llm-provider";
import type {
	AgentInput,
	RunOptions,
	ToolRuntime,
	ToolResult,
} from "@/base/base_agent/runtime/types";
import type { PluginManager } from "@/base/base_agent/plugin/manager";
import type { MemoryManager } from "@/base/base_agent/memory/manager";
import {
	Agent,
	type AgentOptions,
	type AgentTool,
	type AgentMessage,
	type ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { parsePiModelRef } from "@/pi/model";
import { EmptyToolRuntime, MemoryAwareToolRuntime } from "@/base/base_agent/runtime/tool-runtime";
import { AsyncQueue, toSkythMessages, createStreamFn } from "@/base/base_agent/runtime/bridge";

export interface AgentRunOrchestratorOptions {
	provider?: LLMProvider;
	tools?: ToolRuntime;
	defaultModel?: string;
	maxTokens?: number;
	pluginManager?: PluginManager;
	memoryManager?: MemoryManager;
	workspace?: string;
	runEventSink?: RunEventSink;
}

export class AgentRunOrchestrator {
	private readonly agent = new GeneralistAgent();
	private readonly provider?: LLMProvider;
	private readonly tools: ToolRuntime;
	private readonly defaultModel?: string;
	private readonly maxTokens?: number;
	private readonly pluginManager?: PluginManager;
	private readonly memoryManager?: MemoryManager;
	private readonly workspace?: string;
	private readonly runEventSink?: RunEventSink;
	private memoryInitialized = new Set<string>();

	constructor(options: AgentRunOrchestratorOptions = {}) {
		this.provider = options.provider;
		this.tools = options.tools ?? new EmptyToolRuntime();
		this.defaultModel = options.defaultModel;
		this.maxTokens = options.maxTokens;
		this.pluginManager = options.pluginManager;
		this.memoryManager = options.memoryManager;
		this.workspace = options.workspace;
		this.runEventSink = options.runEventSink;
	}

	async *run(
		input: AgentInput,
		options: RunOptions = {},
	): AsyncIterable<RunEvent> {
		const threadId = input.threadId?.trim() || "cli:default";
		const runId = crypto.randomUUID();
		yield await this.recordEvent({
			type: "run_start",
			threadId,
			runId,
			agentId: this.agent.id,
		});

		if (!this.provider) {
			yield await this.recordEvent({
				type: "warning",
				runId,
				message:
					"AgentRunOrchestrator requires a provider before the model loop can run.",
			});
			yield await this.recordEvent({
				type: "run_finish",
				threadId,
				runId,
				agentId: this.agent.id,
				finishReason: "missing-provider",
				output: null,
			});
			return;
		}

		const model =
			this.defaultModel ??
			this.agent.modelPreferences.primary ??
			this.provider.getDefaultModel();
		const memoryContext = {
			threadId,
			runId,
			surface: input.surface,
			model,
			metadata: input.metadata,
		};
		if (this.memoryManager && !this.memoryInitialized.has(threadId)) {
			await this.memoryManager.initialize({
				threadId,
				workspace: this.workspace ?? process.cwd(),
				surface: input.surface,
				agentContext: "primary",
				agentId: this.agent.id,
				metadata: input.metadata,
			});
			this.memoryInitialized.add(threadId);
		}
		await this.memoryManager?.onTurnStart(1, input.text, memoryContext);
		await this.pluginManager?.sessionStart({
			key: threadId,
			sessionId: threadId,
			channel: input.surface,
			chatId: threadId,
			metadata: input.metadata,
		});

		const systemBlocks = [this.agent.buildSystemPrompt()];
		const memorySystem = await this.memoryManager?.buildSystemPrompt();
		if (memorySystem?.trim()) systemBlocks.push(memorySystem.trim());
		const memoryPrefetch = await this.memoryManager?.prefetchAll(
			input.text,
			memoryContext,
		);
		if (memoryPrefetch?.trim()) systemBlocks.push(memoryPrefetch.trim());

		const systemPrompt = systemBlocks.join("\n\n");

		const toolsRuntime = this.memoryManager
			? new MemoryAwareToolRuntime(
					this.tools,
					this.memoryManager,
					memoryContext,
				)
			: this.tools;

		const toolDefinitions = toolsRuntime.getDefinitions();
		const agentTools: AgentTool<any>[] = [];
		const EMPTY_OBJECT_SCHEMA = {
			type: "object",
			properties: {},
			additionalProperties: false,
		};

		let stepIndex = 0;
		for (const raw of toolDefinitions as any[]) {
			const fn = raw.function;
			if (!fn?.name) continue;
			agentTools.push({
				name: fn.name,
				description: fn.description ?? "",
				parameters: (fn.parameters ?? EMPTY_OBJECT_SCHEMA) as any,
				label: fn.name,
				execute: async (toolCallId, params, signal) => {
					const resVal = await toolsRuntime.execute(fn.name, params as Record<string, unknown>, {
						workspace: this.workspace,
						threadId,
						runId,
						agentId: this.agent.id,
						stepIndex,
						surface: input.surface,
						metadata: input.metadata,
						signal,
					});

					if (resVal && typeof resVal === "object" && "content" in resVal) {
						return resVal as any;
					}

					let contentStr = "";
					if (resVal && typeof resVal === "object") {
						contentStr = JSON.stringify(resVal);
					} else {
						contentStr = String(resVal ?? "");
					}

					return {
						content: [{ type: "text", text: contentStr }],
						details: resVal,
					};
				},
			});
		}

		const parsedRef = parsePiModelRef(model);
		const registeredModel = getModel(parsedRef.provider as any, parsedRef.model as any);
		const modelObj = registeredModel ?? {
			id: model,
			name: parsedRef.model,
			api: "openai-responses" as any,
			provider: parsedRef.provider,
			baseUrl: "http://localhost:0",
			reasoning: false,
			input: ["text"] as any[],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128000,
			maxTokens: 16384,
		};

		const streamFn = createStreamFn({
			provider: this.provider,
			pluginManager: this.pluginManager,
			runId,
			threadId,
			getStepIndex: () => stepIndex,
			model,
			input,
		});

		const agentOptions: AgentOptions = {
			initialState: {
				systemPrompt,
				model: modelObj as any,
				tools: agentTools,
				thinkingLevel: "off" as ThinkingLevel,
			},
			streamFn,
			toolExecution: "parallel",
			convertToLlm: (msgs) => msgs as any[],
			transformContext: async (agentMessages, signal) => {
				if (!this.pluginManager) return agentMessages;
				const skythMsgs = toSkythMessages(systemPrompt, agentMessages);
				const modifiedSkythMsgs = await this.pluginManager.applyPreModel(skythMsgs, {
					runId,
					threadId,
					stepIndex,
					model,
					surface: input.surface,
					metadata: input.metadata,
				});

				const resultMessages: AgentMessage[] = [];
				for (const msg of modifiedSkythMsgs) {
					if (!msg) continue;
					const role = String(msg.role ?? "");
					if (role === "system") {
						resultMessages.push({ role: "system", content: String(msg.content ?? "") } as any);
					} else if (role === "user") {
						resultMessages.push({ role: "user", content: String(msg.content ?? ""), timestamp: Number(msg.timestamp ?? Date.now()) });
					} else if (role === "assistant") {
						const content: any[] = [];
						const reasoning = String(msg.reasoning_content ?? "").trim();
						if (reasoning) {
							content.push({ type: "thinking", thinking: reasoning });
						}
						const text = String(msg.content ?? "").trim();
						if (text) {
							content.push({ type: "text", text });
						}
						const rawCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
						for (const raw of rawCalls) {
							content.push({
								type: "toolCall",
								id: String(raw.id ?? ""),
								name: String(raw.function?.name ?? ""),
								arguments: typeof raw.function?.arguments === "string"
									? JSON.parse(raw.function.arguments)
									: (raw.function?.arguments ?? {}),
							});
						}
						resultMessages.push({
							role: "assistant",
							content,
							timestamp: Number(msg.timestamp ?? Date.now()),
						} as any);
					} else if (role === "tool") {
						resultMessages.push({
							role: "toolResult",
							toolCallId: String(msg.tool_call_id ?? ""),
							toolName: String(msg.name ?? ""),
							content: [{ type: "text", text: String(msg.content ?? "") }],
							isError: Boolean(msg.is_error),
							timestamp: Number(msg.timestamp ?? Date.now()),
						} as any);
					} else {
						resultMessages.push(msg as any);
					}
				}
				return resultMessages;
			},
		};

		if (this.pluginManager) {
			agentOptions.beforeToolCall = async (context, signal) => {
				const toolHookCtx = {
					runId,
					threadId,
					agentId: this.agent.id,
					stepIndex,
					surface: input.surface,
					metadata: input.metadata,
				};
				const preToolResult = await this.pluginManager!.applyPreTool(
					context.toolCall.name,
					context.args as Record<string, unknown>,
					toolHookCtx,
				);
				if (!preToolResult.proceed) {
					return { block: true, reason: "Blocked by plugin" };
				}
				if (preToolResult.args) {
					(context.toolCall as any).arguments = preToolResult.args;
				}
				return undefined;
			};

			agentOptions.afterToolCall = async (context, signal) => {
				const toolHookCtx = {
					runId,
					threadId,
					agentId: this.agent.id,
					stepIndex,
					surface: input.surface,
					metadata: input.metadata,
				};
				let resultStr = "";
				if (Array.isArray(context.result.content)) {
					for (const block of context.result.content) {
						if (block.type === "text") {
							resultStr += block.text;
						}
					}
				} else {
					resultStr = String(context.result.content ?? "");
				}

				await this.pluginManager!.applyPostTool(
					context.toolCall.name,
					context.args as Record<string, unknown>,
					resultStr,
					toolHookCtx,
				);
				return undefined;
			};
		}

		const agent = new Agent(agentOptions);
		const queue = new AsyncQueue<RunEvent>();
		const toolStartTimes = new Map<string, number>();

		const unsubscribe = agent.subscribe(async (event, signal) => {
			if (signal.aborted) return;

			switch (event.type) {
				case "turn_start":
					queue.push({
						type: "step_start",
						runId,
						stepIndex,
					});
					break;

				case "message_update": {
					const ae = event.assistantMessageEvent;
					if (ae.type === "text_delta") {
						queue.push({
							type: "model_delta",
							runId,
							stepIndex,
							text: ae.delta,
						});
					} else if (ae.type === "thinking_delta") {
						queue.push({
							type: "reasoning_delta",
							runId,
							stepIndex,
							text: ae.delta,
						});
					}
					break;
				}

				case "message_end": {
					let text = "";
					const msg = event.message;
					if (msg && msg.role === "assistant") {
						for (const block of msg.content) {
							if (block.type === "text") {
								text += block.text;
							}
						}
					}
					queue.push({
						type: "model_complete",
						runId,
						stepIndex,
						text,
					});
					break;
				}

				case "tool_execution_start":
					toolStartTimes.set(event.toolCallId, Date.now());
					queue.push({
						type: "tool_call",
						runId,
						stepIndex,
						call: {
							id: event.toolCallId,
							name: event.toolName,
							arguments: event.args ?? {},
						},
					});
					break;

				case "tool_execution_end": {
					const durationMs = Date.now() - (toolStartTimes.get(event.toolCallId) ?? Date.now());
					toolStartTimes.delete(event.toolCallId);

					let contentStr = "";
					if (typeof event.result === "string") {
						contentStr = event.result;
					} else if (event.result && typeof event.result === "object") {
						if (Array.isArray(event.result.content)) {
							for (const block of event.result.content) {
								if (block.type === "text") {
									contentStr += block.text;
								}
							}
						} else if (typeof event.result.content === "string") {
							contentStr = event.result.content;
						} else {
							contentStr = JSON.stringify(event.result);
						}
					} else {
						contentStr = String(event.result ?? "");
					}

					const toolResult: ToolResult = {
						callId: event.toolCallId,
						name: event.toolName,
						ok: !event.isError,
						content: contentStr,
						durationMs,
						error: event.isError ? contentStr : undefined,
					};

					if (event.isError) {
						queue.push({
							type: "tool_error",
							runId,
							stepIndex,
							result: toolResult,
						});
					} else {
						queue.push({
							type: "tool_result",
							runId,
							stepIndex,
							result: toolResult,
						});
					}
					break;
				}

				case "turn_end": {
					let finishReason = "stop";
					if (event.message && typeof event.message === "object" && "stopReason" in event.message) {
						finishReason = String((event.message as any).stopReason ?? "stop");
					}
					let usage: Record<string, number> | undefined;
					if (event.message && typeof event.message === "object" && "usage" in event.message) {
						const u = (event.message as any).usage;
						if (u) {
							usage = {
								prompt_tokens: u.input,
								completion_tokens: u.output,
								total_tokens: u.totalTokens,
							};
						}
					}
					queue.push({
						type: "step_finish",
						runId,
						stepIndex,
						finishReason,
						usage,
					});
					stepIndex++;
					break;
				}
			}
		});

		if (options.signal) {
			if (options.signal.aborted) {
				return;
			}
			options.signal.addEventListener("abort", () => {
				agent.abort();
			});
		}

		const runPromise = (async () => {
			try {
				await agent.prompt(input.text);
				await agent.waitForIdle();
			} catch (err) {
				queue.push({
					type: "warning",
					runId,
					message: err instanceof Error ? err.message : String(err),
				});
			} finally {
				unsubscribe();
				queue.close();
			}
		})();

		for await (const event of queue) {
			yield await this.recordEvent(event);
		}

		await runPromise;

		let finalOutput: string | null = null;
		const finalToolsUsed: string[] = [];
		const finalMessages = agent.state.messages;

		for (const msg of finalMessages) {
			if (msg && msg.role === "assistant") {
				let text = "";
				for (const block of msg.content) {
					if (block.type === "text") {
						text += block.text;
					} else if (block.type === "toolCall") {
						finalToolsUsed.push(block.name);
					}
				}
				finalOutput = text || null;
			}
		}

		if (finalOutput) {
			await this.memoryManager?.syncAll(input.text, finalOutput, {
				...memoryContext,
				toolCount: finalToolsUsed.length,
			});
		}

		const skythMessages = toSkythMessages(systemPrompt, finalMessages);
		await this.memoryManager?.onSessionEnd(skythMessages, memoryContext);

		await this.pluginManager?.sessionEnd({
			key: threadId,
			sessionId: threadId,
			channel: input.surface,
			chatId: threadId,
			metadata: input.metadata,
		});

		let lastStopReason = "stop";
		const lastMsg = finalMessages[finalMessages.length - 1];
		if (lastMsg && lastMsg.role === "assistant" && "stopReason" in lastMsg) {
			lastStopReason = String((lastMsg as any).stopReason ?? "stop");
		}

		yield await this.recordEvent({
			type: "run_finish",
			threadId,
			runId,
			agentId: this.agent.id,
			finishReason: lastStopReason,
			output: finalOutput,
		});
	}

	private async recordEvent<T extends RunEvent>(event: T): Promise<T> {
		await this.runEventSink?.record(event);
		return event;
	}
}
