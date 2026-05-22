import { GeneralistAgent } from "@/base/base_agent";
import type { RunEvent } from "@/core/events";
import type { LLMProvider } from "@/providers/base";
import { StepRunner } from "@/base/base_agent/runtime/step-runner";
import type {
	AgentInput,
	RunOptions,
	StepRunResult,
	ToolRuntime,
} from "@/base/base_agent/runtime/types";
import type { PluginManager } from "@/base/base_agent/plugin/manager";

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
}

export class AgentRunOrchestrator {
	private readonly agent = new GeneralistAgent();
	private readonly provider?: LLMProvider;
	private readonly tools: ToolRuntime;
	private readonly stepRunner: StepRunner;
	private readonly defaultModel?: string;
	private readonly maxTokens?: number;
	private readonly pluginManager?: PluginManager;

	constructor(options: AgentRunOrchestratorOptions = {}) {
		this.provider = options.provider;
		this.tools = options.tools ?? new EmptyToolRuntime();
		this.stepRunner = options.stepRunner ?? new StepRunner();
		this.defaultModel = options.defaultModel;
		this.maxTokens = options.maxTokens;
		this.pluginManager = options.pluginManager;
	}

	async *run(
		input: AgentInput,
		options: RunOptions = {},
	): AsyncIterable<RunEvent> {
		const threadId = input.threadId?.trim() || "cli:default";
		const runId = crypto.randomUUID();
		yield { type: "run_start", threadId, runId, agentId: this.agent.id };

		if (!this.provider) {
			yield {
				type: "warning",
				runId,
				message:
					"AgentRunOrchestrator requires a provider before the model loop can run.",
			};
			yield {
				type: "run_finish",
				threadId,
				runId,
				agentId: this.agent.id,
				finishReason: "missing-provider",
				output: null,
			};
			return;
		}

		const messages: Array<Record<string, unknown>> = [
			{ role: "system", content: this.agent.buildSystemPrompt() },
			{ role: "user", content: input.text },
		];
		let result: StepRunResult | null = null;
		for await (const event of this.stepRunner.run({
			runId,
			threadId,
			agent: this.agent,
			provider: this.provider,
			tools: this.tools,
			messages,
			model:
				this.defaultModel ??
				this.agent.modelPreferences.primary ??
				this.provider.getDefaultModel(),
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
				yield event;
			}
		}

		yield {
			type: "run_finish",
			threadId,
			runId,
			agentId: this.agent.id,
			finishReason: result?.finishReason ?? "stop",
			output: result?.output ?? null,
		};
	}
}
