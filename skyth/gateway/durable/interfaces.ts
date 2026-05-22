import type { QueueRow } from "@/gateway/workspace/queue-store.ts";
import type { IncomingMessage } from "@/gateway/channels/types.ts";
import type { RunEvent } from "@/core/events";

type MaybePromise<T> = T | Promise<T>;

export interface DurableQueueStore {
	pushUser(payload: IncomingMessage, ts: number): MaybePromise<void>;
	pushGateway(body: string, tag?: string): MaybePromise<void>;
	claimAll(): MaybePromise<QueueRow[]>;
	markDone(ids: number[]): MaybePromise<void>;
	releaseInflight(ids: number[]): MaybePromise<void>;
	pendingStats(): MaybePromise<{ user: number; gateway: number }>;
}

export interface DurableHeartbeatStore {
	append(kind: string, note?: string): Promise<void>;
}

export interface DurableCronStore {
	register(input: {
		schedule: string;
		targetAgentId: string;
		payload: unknown;
	}): Promise<void>;
}

export interface DurableStateTransitionStore {
	record(input: {
		domain: string;
		from?: string | null;
		to: string;
		reason?: string;
		metadata?: Record<string, unknown>;
	}): Promise<void>;
}

export interface DurableRunEventStore {
	record(event: RunEvent): Promise<void> | void;
}

export interface DurableMemoryAuthority {
	recordGatewayTurn(input: {
		channel: string;
		chatId: string;
		userText: string;
		userMessageId?: string;
		ts: number;
	}): Promise<void> | void;
	buildRagHint(query: string, limit?: number): Promise<string | null>;
}
