import { ContextBuilder } from "@/base/base_agent/context/builder";
import { SubagentManager } from "@/base/base_agent/delegation/manager";
import {
	clearConsolidationLock,
	setConsolidationLock,
	waitForConsolidationLock,
} from "@/base/base_agent/memory/consolidation";
import { MemoryStore } from "@/base/base_agent/memory/store";
import type { AgentEvent } from "@/base/base_agent/runtime/eventtypes";
import {
	LOOP_TYPE,
	MODEL_CHAT_TYPE,
	SEND_TYPE,
	TOOL_TYPE,
	WARN_TYPE,
} from "@/base/base_agent/runtime/eventtypes";
import { processMessageWithRuntime } from "@/base/base_agent/runtime/message_processor";
import type { RuntimeContext } from "@/base/base_agent/runtime/types";
import { StickyBridgeController } from "@/base/base_agent/session/bridge";
import type { MessageSendRecord } from "@/base/base_agent/tools/context";
import type { InboundMessage, OutboundMessage } from "@/bus/events";
import type { MessageBus } from "@/bus/queue";
import type { CronService } from "@/cron/service";
import { type EventKind, eventLine } from "@/logging/events";
import type { LLMProvider, StreamCallback } from "@/providers/base";
import { AgentRegistry } from "@/registries/agent_registry";
import { ToolRegistry } from "@/registries/tool_registry";
import { type Session, SessionManager } from "@/session/manager";
import { MergeRouter } from "@/session/router";

export class AgentLoop {
	readonly bus: MessageBus;
	readonly provider: LLMProvider;
	readonly workspace: string;
	readonly model: string;
	readonly maxIterations: number;
	readonly steps: number;
	readonly temperature: number;
	readonly maxTokens: number;
	readonly memoryWindow: number;
	readonly context: ContextBuilder;
	readonly sessions: SessionManager;
	readonly tools: ToolRegistry;
	readonly memory: MemoryStore;
	readonly toolsReady: Promise<void>;
	readonly _consolidating = new Set<string>();
	readonly _consolidation_tasks = new Set<Promise<void>>();
	readonly _consolidation_locks = new Map<string, Promise<void>>();
	readonly subagents: SubagentManager;
	readonly restrictToWorkspace: boolean;
	private toolContextChannel = "cli";
	private toolContextChatId = "direct";
	private finalizedRuns = new Map<string, number>();
	private readonly FINALIZED_RUN_TTL_MS = 5 * 60 * 1000;
	private readonly MAX_FINALIZED_RUNS = 200;

	private pruneFinalizedRuns(): void {
		if (this.finalizedRuns.size <= this.MAX_FINALIZED_RUNS) return;
		const now = Date.now();
		for (const [runId, timestamp] of this.finalizedRuns) {
			if (now - timestamp > this.FINALIZED_RUN_TTL_MS) {
				this.finalizedRuns.delete(runId);
			}
		}
	}
	lastGlobalChannel = "";
	lastGlobalChatId = "";
	mergeRouter: MergeRouter;
	autoMergeOnSwitch: boolean;
	stickyBridge: StickyBridgeController;
	private stickyMergeSwitches: number;
	private stickyMergeTtlMs: number;
	stickyMergeConfidence: number;

	readonly cron?: CronService;
	readonly enabledChannels: string[];
	channelTargets = new Map<string, { channel: string; chatId: string }>();
	private outboundHandoffHints = new Map<
		string,
		{
			sourceKey: string;
			sourceChannel: string;
			sourceChatId: string;
			expiresAt: number;
		}
	>();

	constructor(params: {
		bus: MessageBus;
		provider: LLMProvider;
		workspace: string;
		model?: string;
		max_iterations?: number;
		steps?: number;
		temperature?: number;
		max_tokens?: number;
		memory_window?: number;
		session_manager?: SessionManager;
		exec_timeout?: number;
		restrict_to_workspace?: boolean;
		cron_service?: CronService;
		enable_global_tools?: boolean;
		router_model?: string;
		enabled_channels?: string[];
		session_graph_config?: {
			auto_merge_on_switch?: boolean;
			persist_to_disk?: boolean;
			max_switch_history?: number;
			router_model?: string;
			router_cache_ttl_ms?: number;
			router_cache_max_entries?: number;
			router_max_source_messages?: number;
			router_max_target_messages?: number;
			router_snippet_chars?: number;
			sticky_merge_switches?: number;
			sticky_merge_ttl_ms?: number;
			sticky_merge_confidence?: number;
			model_context_window?: number;
		};
	}) {
		this.bus = params.bus;
		this.provider = params.provider;
		this.workspace = params.workspace;
		this.model = params.model ?? params.provider.getDefaultModel();
		this.maxIterations = params.max_iterations ?? 200;
		this.steps = params.steps ?? 50;
		this.temperature = params.temperature ?? 0.7;
		this.maxTokens = params.max_tokens ?? 4096;
		this.memoryWindow = params.memory_window ?? 50;
		this.context = new ContextBuilder(this.workspace);
		this.sessions =
			params.session_manager ??
			new SessionManager(params.workspace, params.session_graph_config);
		this.tools = new ToolRegistry();
		this.memory = new MemoryStore(this.workspace);
		this.subagents = new SubagentManager({
			provider: this.provider,
			workspace: this.workspace,
			bus: this.bus,
			model: this.model,
			temperature: this.temperature,
			max_tokens: this.maxTokens,
			exec_timeout: params.exec_timeout,
			restrict_to_workspace: params.restrict_to_workspace,
		});
		this.restrictToWorkspace = Boolean(params.restrict_to_workspace);
		this.cron = params.cron_service;
		this.enabledChannels = params.enabled_channels ?? [];
		this.autoMergeOnSwitch =
			params.session_graph_config?.auto_merge_on_switch ?? true;
		const routerModel =
			params.router_model?.trim() ||
			params.session_graph_config?.router_model?.trim() ||
			this.model;
		this.mergeRouter = new MergeRouter(this.provider, routerModel, {
			cacheTtlMs: params.session_graph_config?.router_cache_ttl_ms,
			cacheMaxEntries: params.session_graph_config?.router_cache_max_entries,
			maxSourceMessages:
				params.session_graph_config?.router_max_source_messages,
			maxTargetMessages:
				params.session_graph_config?.router_max_target_messages,
			maxSnippetChars: params.session_graph_config?.router_snippet_chars,
		});
		this.stickyMergeSwitches = Math.max(
			0,
			Number(params.session_graph_config?.sticky_merge_switches ?? 3),
		);
		this.stickyMergeTtlMs = Math.max(
			1000,
			Number(
				params.session_graph_config?.sticky_merge_ttl_ms ?? 30 * 60 * 1000,
			),
		);
		this.stickyMergeConfidence = Math.min(
			1,
			Math.max(
				0,
				Number(params.session_graph_config?.sticky_merge_confidence ?? 0.75),
			),
		);
		this.stickyBridge = new StickyBridgeController(
			this.stickyMergeSwitches,
			this.stickyMergeTtlMs,
		);

		const allowedDir = this.restrictToWorkspace ? this.workspace : undefined;
		this.toolsReady = this.initializeRuntimeTools({
			forceGlobalTools: params.enable_global_tools,
			execTimeout: params.exec_timeout ?? 60,
			allowedDir,
		});
	}

	private async initializeRuntimeTools(params: {
		forceGlobalTools?: boolean;
		execTimeout: number;
		allowedDir?: string;
	}): Promise<void> {
		const agentRegistry = new AgentRegistry();
		agentRegistry.discoverAgents(process.cwd());

		let globalToolsAllowed = params.forceGlobalTools;
		if (globalToolsAllowed === undefined) {
			if (
				agentRegistry.ids.some((id) => agentRegistry.globalToolsEnabled(id))
			) {
				globalToolsAllowed = true;
			} else if (agentRegistry.ids.length === 0) {
				// Compatibility default for direct AgentLoop usage before SDK-manifest agent wiring is complete.
				globalToolsAllowed = true;
			} else {
				globalToolsAllowed = false;
			}
		}

		await this.tools.autoDiscover(process.cwd(), {
			loadGlobalTools: globalToolsAllowed,
		});
		const diagnostics = await this.tools.autoDiscoverWorkspace(this.workspace);

		for (const diag of diagnostics) {
			this.emit("event", "tools", "warn", diag);
		}
		this.emit(
			"event",
			"tools",
			"status",
			`workspace ${diagnostics.length ? "errors" : "ok"}`,
		);
	}

	emit(event: AgentEvent): void;
	emit(
		kind: EventKind,
		scope: string,
		action: string,
		summary?: string,
		details?: Record<string, unknown>,
		key?: string,
	): void;
	emit(
		kindOrEvent: EventKind | AgentEvent,
		scope?: string,
		action?: string,
		summary?: string,
		details?: Record<string, unknown>,
		key?: string,
	): void {
		if (
			kindOrEvent &&
			typeof kindOrEvent === "object" &&
			"sessionKey" in kindOrEvent
		) {
			const event = kindOrEvent as AgentEvent;
			if ("runId" in event) {
				if (this.finalizedRuns.has(event.runId)) {
					return;
				}
				this.finalizedRuns.set(event.runId, Date.now());
				this.pruneFinalizedRuns();
			}
			const kind: EventKind = "event";
			const scope = "agent";
			let action = "";
			let summary = "";
			if ("runId" in event && "toolName" in event) {
				action = TOOL_TYPE;
				summary = (event as { toolName: string }).toolName;
			} else if ("runId" in event) {
				action = MODEL_CHAT_TYPE;
			} else if ("toolName" in event) {
				action = LOOP_TYPE;
				summary = (event as { toolName: string }).toolName;
			} else if ("message" in event) {
				action = WARN_TYPE;
				summary = (event as { message: string }).message;
			} else if ("content" in event) {
				action = SEND_TYPE;
				summary = (event as { content: string }).content;
			}
			console.log(eventLine(kind, scope, action, summary));
			this.memory.recordEvent({
				kind,
				scope,
				action,
				summary,
				session_key: event.sessionKey,
			});
			return;
		}
		const kind = kindOrEvent as EventKind;
		console.log(eventLine(kind, scope!, action!, summary!));
		this.memory.recordEvent({
			kind,
			scope: scope!,
			action: action!,
			summary: summary!,
			details,
			session_key: key,
		});
	}

	updateChannelTargets(
		targets: Map<string, { channel: string; chatId: string }>,
	): void {
		this.channelTargets = new Map(
			[...targets].map(([k, v]) => [
				k,
				{ channel: v.channel, chatId: v.chatId },
			]),
		);
	}

	setToolContext(channel: string, chatId: string, messageId?: string): void {
		this.toolContextChannel = channel;
		this.toolContextChatId = chatId;
	}

	noteOutboundHandoff(records: MessageSendRecord[]): void {
		if (!records.length) return;
		const expiresAt = Date.now() + this.stickyMergeTtlMs;
		for (const record of records) {
			const sourceChannel = String(record.sourceChannel ?? "").trim();
			const sourceChatId = String(record.sourceChatId ?? "").trim();
			const targetChannel = String(record.targetChannel ?? "").trim();
			const targetChatId = String(record.targetChatId ?? "").trim();
			if (!sourceChannel || !sourceChatId || !targetChannel || !targetChatId)
				continue;
			if (sourceChannel === targetChannel && sourceChatId === targetChatId)
				continue;

			const sourceKey = `${sourceChannel}:${sourceChatId}`;
			const targetKey = `${targetChannel}:${targetChatId}`;
			this.outboundHandoffHints.set(targetKey, {
				sourceKey,
				sourceChannel,
				sourceChatId,
				expiresAt,
			});
			this.emit("handoff", "session", "queue", `${sourceKey} -> ${targetKey}`);
			this.channelTargets.set(targetChannel, {
				channel: targetChannel,
				chatId: targetChatId,
			});
		}
	}

	takeOutboundHandoff(targetKey: string):
		| {
				sourceKey: string;
				sourceChannel: string;
				sourceChatId: string;
		  }
		| undefined {
		const entry = this.outboundHandoffHints.get(targetKey);
		if (!entry) return undefined;
		this.outboundHandoffHints.delete(targetKey);
		if (entry.expiresAt <= Date.now()) {
			this.emit(
				"handoff",
				"session",
				"expire",
				`${entry.sourceKey} -> ${targetKey}`,
			);
			return undefined;
		}
		this.emit(
			"handoff",
			"session",
			"consume",
			`${entry.sourceKey} -> ${targetKey}`,
		);
		return {
			sourceKey: entry.sourceKey,
			sourceChannel: entry.sourceChannel,
			sourceChatId: entry.sourceChatId,
		};
	}

	waitForConsolidation(key: string): Promise<void> {
		return waitForConsolidationLock(
			{
				memoryWindow: this.memoryWindow,
				consolidating: this._consolidating,
				tasks: this._consolidation_tasks,
				locks: this._consolidation_locks,
			},
			key,
		);
	}

	setConsolidationLock(key: string, promise: Promise<void>): void {
		setConsolidationLock(
			{
				memoryWindow: this.memoryWindow,
				consolidating: this._consolidating,
				tasks: this._consolidation_tasks,
				locks: this._consolidation_locks,
			},
			key,
			promise,
		);
	}

	clearConsolidationLock(key: string, promise: Promise<void>): void {
		clearConsolidationLock(
			{
				memoryWindow: this.memoryWindow,
				consolidating: this._consolidating,
				tasks: this._consolidation_tasks,
				locks: this._consolidation_locks,
			},
			key,
			promise,
		);
	}

	async processMessage(
		msg: InboundMessage,
		overrideSessionKey?: string,
		onStream?: StreamCallback,
	): Promise<OutboundMessage | null> {
		return processMessageWithRuntime(this, msg, overrideSessionKey, onStream);
	}

	async consolidateMemory(
		session: Session,
		archiveAll = false,
	): Promise<boolean> {
		return this.memory.consolidate(session, this.provider, this.model, {
			archive_all: archiveAll,
			memory_window: this.memoryWindow,
		});
	}
}
