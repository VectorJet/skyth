import { join } from "node:path";
import { SKYTH_HOME } from "@/gateway/config/env.ts";
import type { QueueRow } from "@/gateway/workspace/queue-store.ts";
import { getMemoryStore } from "@/gateway/memory/store.ts";
import type {
	DurableCronStore,
	DurableHeartbeatStore,
	DurableMemoryAuthority,
	DurableQueueStore,
	DurableRunEventStore,
	DurableStateTransitionStore,
} from "@/gateway/durable/interfaces.ts";
import {
	getQuasarClient,
	type QuasarClient,
	type QuasarQueueRow,
} from "@/quasar/client.ts";

const GATEWAY_DB = join(SKYTH_HOME, "quasar", "gateway.quasardb");
const QUEUE_DB = join(SKYTH_HOME, "quasar", "queue.quasardb");
const MEMORY_DB = join(SKYTH_HOME, "quasar", "memory.quasardb");
const RUN_EVENTS_DB = join(SKYTH_HOME, "quasar", "run_events.quasardb");

export function quasarPasswordB64(): string | null {
	const direct = process.env.SKYTH_QUASAR_PASSWORD_B64;
	if (direct?.trim()) return direct.trim();
	const password = process.env.SKYTH_QUASAR_PASSWORD;
	if (!password) return null;
	return Buffer.from(password, "utf8").toString("base64");
}

export async function initializeQuasarDurability(
	client: QuasarClient = getQuasarClient(),
): Promise<boolean> {
	const passwordB64 = quasarPasswordB64();
	const status = await client.status();
	if (status.auth_initialized && passwordB64) {
		await client.unlock(passwordB64);
	} else if (!status.auth_initialized && passwordB64) {
		await client.onboard(
			process.env.SKYTH_QUASAR_USERNAME ?? "skyth",
			passwordB64,
		);
	} else if (!status.auth_initialized) {
		return false;
	}
	await client.openDb({
		dbPath: GATEWAY_DB,
		dbKind: "gateway",
		createIfMissing: true,
	});
	await client.openDb({
		dbPath: QUEUE_DB,
		dbKind: "gateway_queue",
		createIfMissing: true,
	});
	await client.openDb({
		dbPath: MEMORY_DB,
		dbKind: "memory",
		createIfMissing: true,
	});
	await client.openDb({
		dbPath: RUN_EVENTS_DB,
		dbKind: "gateway",
		createIfMissing: true,
	});
	return true;
}

export class QuasarHeartbeatAdapter implements DurableHeartbeatStore {
	constructor(private client: QuasarClient = getQuasarClient()) {}

	async append(kind: string, note?: string): Promise<void> {
		await this.client.appendHeartbeat(kind, note);
	}
}

export class QuasarCronAdapter implements DurableCronStore {
	constructor(private client: QuasarClient = getQuasarClient()) {}

	async register(input: {
		schedule: string;
		targetAgentId: string;
		payload: unknown;
	}): Promise<void> {
		await this.client.registerCron(input);
	}
}

export class QuasarQueueAdapter implements DurableQueueStore {
	constructor(
		private client: QuasarClient = getQuasarClient(),
		private dbPath = QUEUE_DB,
	) {}

	async open(): Promise<void> {
		await this.client.openDb({
			dbPath: this.dbPath,
			dbKind: "gateway_queue",
			createIfMissing: true,
		});
	}

	async pushUser(payload: unknown, ts: number): Promise<void> {
		await this.client.queuePushUser({
			dbPath: this.dbPath,
			payload: JSON.stringify(payload),
			ts,
			enqueuedAt: Date.now(),
		});
	}

	async pushGateway(body: string, tag?: string): Promise<void> {
		await this.client.queuePushGateway({
			dbPath: this.dbPath,
			payload: JSON.stringify({ body }),
			tag,
			ts: Date.now(),
			enqueuedAt: Date.now(),
		});
	}

	async claimAll(): Promise<QueueRow[]> {
		return (await this.client.queueClaimAll(this.dbPath)).map(
			queueRowFromQuasar,
		);
	}

	async markDone(ids: number[]): Promise<void> {
		await this.client.queueMarkDone(this.dbPath, ids);
	}

	async releaseInflight(ids: number[]): Promise<void> {
		await this.client.queueReleaseInflight(this.dbPath, ids);
	}

	pendingStats(): Promise<{ user: number; gateway: number }> {
		return this.client.queuePendingStats(this.dbPath);
	}
}

export class QuasarStateTransitionAdapter
	implements DurableStateTransitionStore
{
	constructor(private client: QuasarClient = getQuasarClient()) {}

	async record(input: {
		domain: string;
		from?: string | null;
		to: string;
		reason?: string;
		metadata?: Record<string, unknown>;
	}): Promise<void> {
		await this.client.stateRecord({
			dbPath: GATEWAY_DB,
			domain: input.domain,
			from: input.from,
			to: input.to,
			reason: input.reason,
			metadata: input.metadata ?? {},
		});
	}
}

export class QuasarRunEventAdapter implements DurableRunEventStore {
	private sequence = 0;

	constructor(
		private client: QuasarClient = getQuasarClient(),
		private dbPath = RUN_EVENTS_DB,
	) {}

	async record(
		event: Parameters<DurableRunEventStore["record"]>[0],
	): Promise<void> {
		const runId = "runId" in event && event.runId ? event.runId : "unknown";
		const threadId =
			"threadId" in event && typeof event.threadId === "string"
				? event.threadId
				: null;
		const stepIndex =
			"stepIndex" in event && typeof event.stepIndex === "number"
				? event.stepIndex
				: null;
		await this.client.runEventRecord({
			dbPath: this.dbPath,
			runId,
			threadId,
			stepIndex,
			sequence: ++this.sequence,
			eventType: event.type,
			payload: event,
		});
	}
}

function queueRowFromQuasar(row: QuasarQueueRow): QueueRow {
	return {
		id: row.id,
		kind: row.kind,
		payload: row.payload,
		tag: row.tag,
		ts: row.ts,
		enqueuedAt: row.enqueued_at,
		status: row.status,
	};
}

export class GatewayMemoryCompatibilityAdapter
	implements DurableMemoryAuthority
{
	recordGatewayTurn(input: {
		channel: string;
		chatId: string;
		userText: string;
		userMessageId?: string;
		ts: number;
	}): void {
		getMemoryStore().upsertGatewayTurn(input);
	}

	buildRagHint(query: string, limit?: number): Promise<string | null> {
		return getMemoryStore().buildRagHint(query, limit);
	}
}

export class QuasarMemoryMirrorAdapter implements DurableMemoryAuthority {
	constructor(
		private client: QuasarClient = getQuasarClient(),
		private compatibility = new GatewayMemoryCompatibilityAdapter(),
	) {}

	async recordGatewayTurn(input: {
		channel: string;
		chatId: string;
		userText: string;
		userMessageId?: string;
		ts: number;
	}): Promise<void> {
		this.compatibility.recordGatewayTurn(input);
		try {
			await this.client.memoryRecordGatewayTurn({
				dbPath: MEMORY_DB,
				channel: input.channel,
				chatId: input.chatId,
				userText: input.userText,
				userMessageId: input.userMessageId,
				ts: input.ts,
			});
		} catch (err) {
			console.warn("[quasar] memory mirror failed:", err);
		}
	}

	async buildRagHint(query: string, limit?: number): Promise<string | null> {
		try {
			const hits = await this.client.memorySearch({
				dbPath: MEMORY_DB,
				query,
				limit: limit ?? 5,
			});
			if (hits.length > 0) {
				return [
					"[GATEWAY | RAG]",
					...hits.map(
						(hit, index) =>
							`${index + 1}. ${hit.role} in ${hit.thread_id}: ${hit.snippet || hit.text.slice(0, 320)}`,
					),
				].join("\n");
			}
		} catch (err) {
			console.warn("[quasar] memory search failed:", err);
		}
		return this.compatibility.buildRagHint(query, limit);
	}
}
