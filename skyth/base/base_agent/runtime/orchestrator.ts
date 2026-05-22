import { GeneralistAgent } from "@/base/base_agent";
import type { RunEvent, RunEventSink } from "@/core/events";
import type { LLMProvider } from "@/providers/base";
import { StepRunner } from "@/base/base_agent/runtime/step-runner";
import type {
	AgentInput,
	RunOptions,
	StepRunResult,
	ToolExecutionContext,
	ToolRuntime,
} from "@/base/base_agent/runtime/types";
import type { PluginManager } from "@/base/base_agent/plugin/manager";
import type { MemoryManager } from "@/base/base_agent/memory/manager";

class EmptyToolRuntime implements ToolRuntime {
	getDefinitions(): Array<Record<string, unknown>> {
		return [];
	}

	async execute(name: string): Promise<unknown> {
		throw new Error(`Tool '${name}' is not available in this runtime`);
	}
}

export interface AgentRunOrchestratorOptions {
	provider?: LLMProvider;
	tools?: ToolRuntime;
	stepRunner?: StepRunner;
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
	private readonly stepRunner: StepRunner;
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
		this.stepRunner = options.stepRunner ?? new StepRunner();
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

		const messages: Array<Record<string, unknown>> = [
			{ role: "system", content: systemBlocks.join("\n\n") },
			{ role: "user", content: input.text },
		];
		const tools = this.memoryManager
			? new MemoryAwareToolRuntime(
					this.tools,
					this.memoryManager,
					memoryContext,
				)
			: this.tools;
		let result: StepRunResult | null = null;
		for await (const event of this.stepRunner.run({
			runId,
			threadId,
			agent: this.agent,
			provider: this.provider,
			tools,
			messages,
			model,
			temperature: this.agent.temperature,
			maxTokens: this.maxTokens,
			maxSteps: options.maxSteps ?? this.agent.maxSteps ?? 50,
			surface: input.surface,
			metadata: input.metadata,
			signal: options.signal,
			pluginManager: this.pluginManager,
		})) {
			if ("messages" in event && "toolsUsed" in event) {
				result = event;
			} else {
				yield await this.recordEvent(event);
			}
		}
		if (result?.output) {
			await this.memoryManager?.syncAll(input.text, result.output, {
				...memoryContext,
				toolCount: result.toolsUsed.length,
			});
		}
		if (result) {
			await this.memoryManager?.onSessionEnd(result.messages, memoryContext);
		}
		await this.pluginManager?.sessionEnd({
			key: threadId,
			sessionId: threadId,
			channel: input.surface,
			chatId: threadId,
			metadata: input.metadata,
		});

		yield await this.recordEvent({
			type: "run_finish",
			threadId,
			runId,
			agentId: this.agent.id,
			finishReason: result?.finishReason ?? "stop",
			output: result?.output ?? null,
		});
	}

	private async recordEvent<T extends RunEvent>(event: T): Promise<T> {
		await this.runEventSink?.record(event);
		return event;
	}
}

class MemoryAwareToolRuntime implements ToolRuntime {
	constructor(
		private readonly inner: ToolRuntime,
		private readonly memory: MemoryManager,
		private readonly memoryContext: {
			threadId: string;
			runId: string;
			surface?: string;
			model?: string;
			metadata?: Record<string, unknown>;
		},
	) {}

	getDefinitions(): Array<Record<string, unknown>> {
		return [
			...this.inner.getDefinitions(),
			...this.memory.getToolSchemas().map((schema) => ({
				type: "function",
				function: schema,
			})),
		];
	}

	async execute(
		name: string,
		args: Record<string, unknown>,
		context: ToolExecutionContext,
	): Promise<unknown> {
		if (
			this.memory
				.getToolSchemas()
				.some((schema) => String(schema.name ?? "") === name)
		) {
			return await this.memory.handleToolCall(name, args, {
				...this.memoryContext,
				runId: context.runId,
				toolCount: context.stepIndex + 1,
			});
		}
		return await this.inner.execute(name, args, context);
	}
}
