import type { InboundMessage } from "@/base/base_agent/bus/events";

export interface PluginContext {
	agentId?: string;
	workspace?: string;
	surface?: string;
	metadata?: Record<string, unknown>;
}

export interface ModelHookContext {
	runId: string;
	threadId: string;
	stepIndex: number;
	model: string;
	surface?: string;
	metadata?: Record<string, unknown>;
}

export interface ToolHookContext {
	runId: string;
	threadId: string;
	agentId: string;
	stepIndex: number;
	surface?: string;
	metadata?: Record<string, unknown>;
}

export interface SessionHookContext {
	key: string;
	sessionId?: string;
	previousKey?: string;
	channel?: string;
	chatId?: string;
	metadata?: Record<string, unknown>;
}

export interface ToolInterceptResult {
	proceed: boolean;
	modifiedArgs?: Record<string, unknown>;
}

export interface Plugin {
	/** Unique identifier for this plugin. */
	readonly name: string;
	readonly version?: string;
	readonly description?: string;

	// ── Plugin lifecycle ──

	/** Called once when the plugin is registered with the manager. */
	onPluginInit?(ctx: PluginContext): void | Promise<void>;

	/** Called once when the plugin manager is shut down. */
	onPluginDestroy?(ctx: PluginContext): void | Promise<void>;



	// ── Model hooks (wrap provider.chat()) ──

	/**
	 * Called before each provider chat invocation.
	 * May return modified messages to inject context or rewrite prompts.
	 * Return `void` or `undefined` to leave messages unchanged.
	 */
	onPreModel?(
		messages: Array<Record<string, unknown>>,
		context: ModelHookContext,
	):
		| Array<Record<string, unknown>>
		| void
		| Promise<Array<Record<string, unknown>> | void>;

	/**
	 * Called after each provider chat invocation.
	 * May return a modified response.
	 */
	onPostModel?(
		response: Record<string, unknown>,
		context: ModelHookContext,
	): Record<string, unknown> | void | Promise<Record<string, unknown> | void>;

	// ── Tool hooks (wrap tool execution) ──

	/**
	 * Called before a tool is executed.
	 * Return `{ proceed: false }` to block execution, or `{ modifiedArgs }` to alter arguments.
	 */
	onPreTool?(
		toolName: string,
		args: Record<string, unknown>,
		context: ToolHookContext,
	): ToolInterceptResult | void | Promise<ToolInterceptResult | void>;

	/**
	 * Called after a tool has been executed.
	 */
	onPostTool?(
		toolName: string,
		args: Record<string, unknown>,
		result: string,
		context: ToolHookContext,
	): void | Promise<void>;

	// ── Session hooks ──

	onSessionStart?(context: SessionHookContext): void | Promise<void>;
	onSessionEnd?(context: SessionHookContext): void | Promise<void>;
	onSessionSwitch?(context: SessionHookContext): void | Promise<void>;
}
