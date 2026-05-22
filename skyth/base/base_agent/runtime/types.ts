import type { ContextBuilder } from "@/base/base_agent/context/builder";
import type { SubagentManager } from "@/base/base_agent/delegation/manager";
import type { MemoryStore } from "@/base/base_agent/memory/store";
import type { AgentEvent } from "@/base/base_agent/runtime/eventtypes";
import type { StickyBridgeController } from "@/base/base_agent/session/bridge";
import type { InboundMessage, OutboundMessage } from "@/base/base_agent/bus/events";
import type { MessageBus } from "@/base/base_agent/bus/queue";
import type { CronService } from "@/cron/service";
import type { ToolRegistry } from "@/base/base_agent/tools/registry";
import type { Session, SessionManager } from "@/base/base_agent/session/core/manager";
import type { MergeRouter } from "@/base/base_agent/session/core/router";

export interface OutboundHandoff {
	sourceKey: string;
	sourceChannel: string;
	sourceChatId: string;
}

export interface RuntimeContext {
	toolsReady: Promise<void>;
	bus: MessageBus;
	sessions: SessionManager;
	tools: ToolRegistry;
	context: ContextBuilder;
	memory: MemoryStore;
	subagents: SubagentManager;
	cron?: CronService;
	workspace: string;
	enabledChannels: string[];
	channelTargets: Map<string, { channel: string; chatId: string }>;
	model: string;
	temperature: number;
	maxTokens: number;
	maxIterations: number;
	steps: number;
	memoryWindow: number;
	provider: any;
	_consolidating: Set<string>;
	_consolidation_tasks: Set<Promise<void>>;
	_consolidation_locks: Map<string, Promise<void>>;
	stickyBridge: StickyBridgeController;
	stickyMergeConfidence: number;
	mergeRouter: MergeRouter;
	autoMergeOnSwitch: boolean;
	lastGlobalChannel: string;
	lastGlobalChatId: string;

	setToolContext(channel: string, chatId: string, messageId?: string): void;
	takeOutboundHandoff(targetKey: string): OutboundHandoff | undefined;
	noteOutboundHandoff(records: any[]): void;
	emit(event: AgentEvent): void;
	emit(
		kind: string,
		scope: string,
		action: string,
		summary?: string,
		details?: Record<string, unknown>,
		key?: string,
	): void;

	waitForConsolidation(key: string): Promise<void>;
	setConsolidationLock(key: string, promise: Promise<void>): void;
	clearConsolidationLock(key: string, promise: Promise<void>): void;
	consolidateMemory(session: Session, archiveAll?: boolean): Promise<boolean>;
}

export interface ProcessContext {
	key: string;
	session: Session;
	previousChannel?: string;
	previousChatId?: string;
	platformChanged: boolean;
	outboundHandoff?: OutboundHandoff;
}

export type CommandResult = {
	handled: boolean;
	response: OutboundMessage | null;
};

export type RuntimeInbound = InboundMessage;
