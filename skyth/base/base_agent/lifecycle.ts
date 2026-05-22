import type {
	InboundMessage,
	OutboundMessage,
} from "@/base/base_agent/bus/events";
import type { StreamCallback } from "@/providers/base";
import { AgentLoop } from "@/base/base_agent/runtime";
import { PluginManager } from "@/base/base_agent/plugin/manager";
import type { RuntimeContext } from "@/base/base_agent/runtime/types";

export class AgentLifecycle {
	private readonly runtime: AgentLoop;
	private readonly plugins?: PluginManager;
	private started = false;

	constructor(
		params: ConstructorParameters<typeof AgentLoop>[0] & {
			plugins?: PluginManager;
		},
	) {
		const { plugins, ...loopParams } = params;
		this.plugins = plugins;
		this.runtime = new AgentLoop(loopParams);
	}

	private getRuntimeContext(): RuntimeContext {
		// The AgentLoop is duck-typed as a RuntimeContext for plugin hooks.
		return this.runtime as unknown as RuntimeContext;
	}

	async init(): Promise<void> {
		// Runtime constructor performs eager dependency wiring.
		if (this.plugins) {
			await this.plugins.initAgent(this.getRuntimeContext());
		}
	}

	async start(): Promise<void> {
		this.started = true;
		if (this.plugins) {
			await this.plugins.startAgent(this.getRuntimeContext());
		}
	}

	async processMessage(
		msg: InboundMessage,
		overrideSessionKey?: string,
		onStream?: StreamCallback,
	): Promise<OutboundMessage | null> {
		if (!this.started) {
			await this.start();
		}
		const runtime = this.getRuntimeContext();

		// Dispatch onMessage hooks
		if (this.plugins) {
			await this.plugins.dispatchMessage(msg, runtime);
		}

		const response = await this.runtime.processMessage(
			msg,
			overrideSessionKey,
			onStream,
			this.plugins,
		);

		// Dispatch onResponse hooks
		if (this.plugins && response?.content) {
			await this.plugins.dispatchResponse(response.content, runtime);
		}

		return response;
	}

	async stop(): Promise<void> {
		if (this.plugins) {
			await this.plugins.stopAgent(this.getRuntimeContext());
		}
		this.started = false;
	}

	async destroy(): Promise<void> {
		if (this.plugins) {
			await this.plugins.destroyAgent(this.getRuntimeContext());
		}
		this.started = false;
	}

	getPlugins(): PluginManager | undefined {
		return this.plugins;
	}

	getRuntime(): AgentLoop {
		return this.runtime;
	}
}
