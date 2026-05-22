import type { MessageBus } from "@/base/base_agent/bus/queue";
import type { SessionManager } from "@/base/base_agent/session/core/manager";
import type { SubagentManager } from "@/base/base_agent/delegation/manager";
import type { CronService } from "@/cron/service";
import type { MemoryStore } from "@/base/base_agent/memory/store";

export interface MessageSendRecord {
	sourceChannel: string;
	sourceChatId: string;
	targetChannel: string;
	targetChatId: string;
}

export interface TurnTracker {
	sentInTurn: boolean;
	sendRecords: MessageSendRecord[];
}

export function createTurnTracker(): TurnTracker {
	return { sentInTurn: false, sendRecords: [] };
}

export interface ToolExecutionContext {
	workspace: string;
	bus: MessageBus;
	sessions: SessionManager;
	subagents: SubagentManager;
	memory: MemoryStore;
	cron?: CronService;
	channel: string;
	chatId: string;
	messageId?: string;
	sessionKey: string;
	turnTracker: TurnTracker;
}
