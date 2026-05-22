export interface MemoryProviderInitializeOptions {
	threadId: string;
	workspace: string;
	surface?: string;
	agentContext?: "primary" | "subagent" | "cron" | "flush";
	agentId?: string;
	parentThreadId?: string;
	userId?: string;
	metadata?: Record<string, unknown>;
}

export interface MemoryTurnContext {
	threadId: string;
	runId?: string;
	surface?: string;
	model?: string;
	remainingTokens?: number;
	toolCount?: number;
	metadata?: Record<string, unknown>;
}

export interface MemorySessionSwitchContext {
	threadId: string;
	previousThreadId?: string;
	reset?: boolean;
	parentThreadId?: string;
	metadata?: Record<string, unknown>;
}

export interface MemoryDelegationContext {
	threadId: string;
	childThreadId?: string;
	agentId?: string;
	metadata?: Record<string, unknown>;
}

export interface MemoryProvider {
	readonly name: string;
	readonly external?: boolean;

	isAvailable(): boolean | Promise<boolean>;
	initialize(options: MemoryProviderInitializeOptions): void | Promise<void>;
	systemPromptBlock(): string | Promise<string>;
	prefetch(query: string, context: MemoryTurnContext): string | Promise<string>;
	queuePrefetch?(
		query: string,
		context: MemoryTurnContext,
	): void | Promise<void>;
	syncTurn(
		userContent: string,
		assistantContent: string,
		context: MemoryTurnContext,
	): void | Promise<void>;
	getToolSchemas(): Array<Record<string, unknown>>;
	handleToolCall?(
		toolName: string,
		args: Record<string, unknown>,
		context: MemoryTurnContext,
	): string | Promise<string>;
	shutdown(): void | Promise<void>;

	onTurnStart?(
		turnNumber: number,
		message: string,
		context: MemoryTurnContext,
	): void | Promise<void>;
	onSessionEnd?(
		messages: Array<Record<string, unknown>>,
		context: MemoryTurnContext,
	): void | Promise<void>;
	onSessionSwitch?(context: MemorySessionSwitchContext): void | Promise<void>;
	onPreCompress?(
		messages: Array<Record<string, unknown>>,
		context: MemoryTurnContext,
	): string | Promise<string>;
	onMemoryWrite?(
		action: string,
		target: string,
		content: string,
		metadata?: Record<string, unknown>,
	): void | Promise<void>;
	onDelegation?(
		task: string,
		result: string,
		context: MemoryDelegationContext,
	): void | Promise<void>;
}
