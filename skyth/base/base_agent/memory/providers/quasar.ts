import { getQuasarClient, type QuasarClient } from "@/quasar/client";
import type { QuasarMemoryHit } from "@/quasar/protocol";
import type {
	MemoryDelegationContext,
	MemoryProvider,
	MemoryProviderInitializeOptions,
	MemorySessionSwitchContext,
	MemoryTurnContext,
} from "@/base/base_agent/memory/provider";

export interface QuasarMemoryProviderOptions {
	dbPath?: string;
	actor?: string;
	searchLimit?: number;
}

function formatHit(hit: QuasarMemoryHit): string {
	const date = new Date(hit.ts_unix_ms).toISOString().slice(0, 16).replace("T", " ");
	return `[${date}] (${hit.source}) ${hit.role}: ${hit.snippet}`;
}

export class QuasarMemoryProvider implements MemoryProvider {
	readonly name = "quasar";
	readonly external = true;

	private client: QuasarClient | null = null;
	private dbPath: string;
	private actor: string;
	private searchLimit: number;
	private ready = false;

	constructor(options: QuasarMemoryProviderOptions = {}) {
		this.dbPath = options.dbPath ?? "memory/main";
		this.actor = options.actor ?? "skyth";
		this.searchLimit = options.searchLimit ?? 5;
	}

	isAvailable(): boolean {
		return this.ready;
	}

	async initialize(options: MemoryProviderInitializeOptions): Promise<void> {
		try {
			this.client = getQuasarClient();
			await this.client.ping();
			await this.client.openDb({
				dbPath: this.dbPath,
				dbKind: "memory",
				createIfMissing: true,
			});
			this.ready = true;
		} catch (error) {
			this.ready = false;
			throw error;
		}
	}

	async systemPromptBlock(): Promise<string> {
		if (!this.ready) return "";
		return [
			"Memory system (Quasar) is active.",
			"Past conversation context is automatically recalled before each turn.",
			"Each turn is persisted for future retrieval.",
			"Use the memory_search tool to find specific past information.",
		].join(" ");
	}

	async prefetch(query: string, context: MemoryTurnContext): Promise<string> {
		if (!this.ready || !this.client) return "";
		try {
			const hits = await this.client.memorySearch({
				dbPath: this.dbPath,
				query,
				limit: this.searchLimit,
			});
			if (!hits.length) return "";
			const lines = hits.map(formatHit);
			return `Related memory (${hits.length} results):\n${lines.join("\n")}`;
		} catch {
			return "";
		}
	}

	async syncTurn(
		userContent: string,
		assistantContent: string,
		context: MemoryTurnContext,
	): Promise<void> {
		if (!this.ready || !this.client) return;
		try {
			await this.client.memoryRecordGatewayTurn({
				dbPath: this.dbPath,
				channel: context.surface ?? "cli",
				chatId: context.threadId,
				userText: userContent,
				assistantText: assistantContent,
				ts: Date.now(),
			});
		} catch {
			// Silently log failure; memory recording should not block the turn.
		}
	}

	getToolSchemas(): Array<Record<string, unknown>> {
		return [
			{
				name: "memory_search",
				description: "Search persistent memory for past conversation context. Use this to find relevant information from previous interactions.",
				parameters: {
					type: "object",
					properties: {
						query: {
							type: "string",
							description: "The query to search memory for",
						},
						limit: {
							type: "number",
							description: "Maximum number of results (default 5)",
							default: 5,
						},
					},
					required: ["query"],
				},
			},
			{
				name: "memory_record",
				description: "Explicitly record a fact or observation into persistent memory. Use this for storing important information you want to remember across conversations.",
				parameters: {
					type: "object",
					properties: {
						content: {
							type: "string",
							description: "The fact or observation to record",
						},
						tags: {
							type: "string",
							description: "Optional comma-separated tags for categorization",
						},
					},
					required: ["content"],
				},
			},
		];
	}

	async handleToolCall(
		toolName: string,
		args: Record<string, unknown>,
		context: MemoryTurnContext,
	): Promise<string> {
		if (!this.ready || !this.client) {
			return JSON.stringify({ error: "Memory system is not available" });
		}

		if (toolName === "memory_search") {
			try {
				const query = String(args.query ?? "");
				const limit =
					typeof args.limit === "number"
						? args.limit
						: this.searchLimit;
				const hits = await this.client.memorySearch({
					dbPath: this.dbPath,
					query,
					limit,
				});
				const formatted = hits.map((h) => ({
					id: h.id,
					ts: h.ts_unix_ms,
					source: h.source,
					role: h.role,
					snippet: h.snippet,
					rank: h.rank,
				}));
				return JSON.stringify({ results: formatted, count: formatted.length });
			} catch (error) {
				return JSON.stringify({
					error: `Memory search failed: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}

		if (toolName === "memory_record") {
			try {
				const content = String(args.content ?? "");
				const tags = String(args.tags ?? "");
				// Record as a synthetic turn with user text containing the fact
				await this.client.memoryRecordGatewayTurn({
					dbPath: this.dbPath,
					channel: context.surface ?? "cli",
					chatId: context.threadId,
					userText: `[Memory record] ${content}${tags ? ` (tags: ${tags})` : ""}`,
					assistantText: "[Memory recorded]",
					ts: Date.now(),
				});
				return JSON.stringify({ ok: true, message: "Memory recorded." });
			} catch (error) {
				return JSON.stringify({
					error: `Memory record failed: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}

		return JSON.stringify({ error: `Unknown memory tool: ${toolName}` });
	}

	async shutdown(): Promise<void> {
		this.ready = false;
		this.client = null;
	}

	// Optional lifecycle hooks

	async onTurnStart(
		turnNumber: number,
		message: string,
		context: MemoryTurnContext,
	): Promise<void> {
		// No-op; memory search happens via prefetch.
	}

	async onSessionEnd(
		messages: Array<Record<string, unknown>>,
		context: MemoryTurnContext,
	): Promise<void> {
		// No-op; turns are synced individually.
	}

	async onSessionSwitch(context: MemorySessionSwitchContext): Promise<void> {
		// No-op; prefetch handles the new session context.
	}

	async onMemoryWrite(
		action: string,
		target: string,
		content: string,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		// No-op; memory is written through syncTurn and handleToolCall.
	}

	async onDelegation(
		task: string,
		result: string,
		context: MemoryDelegationContext,
	): Promise<void> {
		// No-op; subagent context is recorded by the parent agent's syncTurn.
	}
}
