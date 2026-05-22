import { join } from "node:path";
import { envFirst, envNumber, SKYTH_HOME } from "@/gateway/config/env.ts";
import { decodeBase64, encodeBase64 } from "@/quasar/codec.ts";
import { requestQuasar } from "@/quasar/ipc.ts";
import type {
	QuasarMemoryHit,
	QuasarQueueRow,
	QuasarRunEventRow,
	RequestKind,
	ResponseKind,
} from "@/quasar/protocol.ts";

export type {
	QuasarMemoryHit,
	QuasarQueueRow,
	QuasarRunEventRow,
	QuasarStateTransition,
} from "@/quasar/protocol.ts";

export interface QuasarClientOptions {
	actor?: string;
	socketPath?: string;
	timeoutMs?: number;
}

const DEFAULT_SOCKET = join(SKYTH_HOME, "quasar.sock");
const DEFAULT_TIMEOUT_MS = envNumber(
	"SKYTH_QUASAR_TIMEOUT_MS",
	"QUASAR_TIMEOUT_MS",
	30_000,
);

export class QuasarClient {
	private actor: string;
	private socketPath: string;
	private timeoutMs: number;

	constructor(options: QuasarClientOptions = {}) {
		this.actor = options.actor ?? "generalist";
		this.socketPath =
			options.socketPath ??
			envFirst("SKYTH_QUASAR_SOCKET", "QUASAR_SOCKET") ??
			DEFAULT_SOCKET;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	async ping(): Promise<void> {
		await this.request({ op: "ping" }, "pong");
	}

	async status(): Promise<Extract<ResponseKind, { result: "status" }>> {
		return this.request({ op: "status" }, "status");
	}

	async onboard(username: string, passwordB64: string): Promise<void> {
		await this.request(
			{ op: "onboard", username, password_b64: passwordB64 },
			"ok",
		);
	}

	async unlock(passwordB64: string): Promise<void> {
		await this.request({ op: "unlock", password_b64: passwordB64 }, "ok");
	}

	async openDb(input: {
		dbPath: string;
		dbKind: string;
		createIfMissing?: boolean;
	}): Promise<void> {
		await this.request(
			{
				op: "db_open",
				db_path: input.dbPath,
				db_kind: input.dbKind,
				create_if_missing: input.createIfMissing ?? true,
			},
			"db_opened",
		);
	}

	async readText(input: {
		dbPath: string;
		namespace: string;
		path: string;
	}): Promise<string | null> {
		const result = await this.request(
			{
				op: "vfs_read",
				db_path: input.dbPath,
				namespace: input.namespace,
				path: input.path,
			},
			"vfs_bytes",
		);
		if (!result.content_b64) return null;
		return new TextDecoder().decode(decodeBase64(result.content_b64));
	}

	async writeText(input: {
		dbPath: string;
		namespace: string;
		path: string;
		content: string;
	}): Promise<number> {
		const result = await this.request(
			{
				op: "vfs_write",
				db_path: input.dbPath,
				namespace: input.namespace,
				path: input.path,
				content_b64: encodeBase64(input.content),
			},
			"vfs_event_id",
		);
		return result.event_id;
	}

	async appendHeartbeat(kind: string, note?: string): Promise<void> {
		await this.request({ op: "heartbeat_append", kind, note }, "ok");
	}

	async registerCron(input: {
		schedule: string;
		targetAgentId: string;
		payload: unknown;
	}): Promise<void> {
		await this.request(
			{
				op: "cron_register",
				schedule: input.schedule,
				target_agent_id: input.targetAgentId,
				payload: input.payload,
			},
			"ok",
		);
	}

	async queuePushUser(input: {
		dbPath: string;
		payload: string;
		ts: number;
		enqueuedAt: number;
	}): Promise<number> {
		const result = await this.request(
			{
				op: "queue_push_user",
				db_path: input.dbPath,
				payload: input.payload,
				ts: input.ts,
				enqueued_at: input.enqueuedAt,
			},
			"queue_row_id",
		);
		return result.id;
	}

	async queuePushGateway(input: {
		dbPath: string;
		payload: string;
		tag?: string;
		ts: number;
		enqueuedAt: number;
	}): Promise<number> {
		const result = await this.request(
			{
				op: "queue_push_gateway",
				db_path: input.dbPath,
				payload: input.payload,
				tag: input.tag ?? null,
				ts: input.ts,
				enqueued_at: input.enqueuedAt,
			},
			"queue_row_id",
		);
		return result.id;
	}

	async queueClaimAll(dbPath: string): Promise<QuasarQueueRow[]> {
		const result = await this.request(
			{ op: "queue_claim_all", db_path: dbPath },
			"queue_rows",
		);
		return result.rows;
	}

	async queueMarkDone(dbPath: string, ids: number[]): Promise<void> {
		await this.request({ op: "queue_mark_done", db_path: dbPath, ids }, "ok");
	}

	async queueReleaseInflight(dbPath: string, ids: number[]): Promise<void> {
		await this.request(
			{ op: "queue_release_inflight", db_path: dbPath, ids },
			"ok",
		);
	}

	async queuePendingStats(
		dbPath: string,
	): Promise<{ user: number; gateway: number }> {
		const result = await this.request(
			{ op: "queue_pending_stats", db_path: dbPath },
			"queue_stats",
		);
		return result.stats;
	}

	async stateRecord(input: {
		dbPath: string;
		domain: string;
		from?: string | null;
		to: string;
		reason?: string | null;
		metadata?: unknown;
	}): Promise<number> {
		const result = await this.request(
			{
				op: "state_record",
				db_path: input.dbPath,
				domain: input.domain,
				from_state: input.from ?? null,
				to_state: input.to,
				reason: input.reason ?? null,
				metadata: input.metadata ?? {},
			},
			"state_transition_id",
		);
		return result.id;
	}

	async memoryRecordGatewayTurn(input: {
		dbPath: string;
		channel: string;
		chatId: string;
		userText?: string | null;
		assistantText?: string | null;
		userMessageId?: string | null;
		ts: number;
	}): Promise<number[]> {
		const result = await this.request(
			{
				op: "memory_record_gateway_turn",
				db_path: input.dbPath,
				channel: input.channel,
				chat_id: input.chatId,
				user_text: input.userText ?? null,
				assistant_text: input.assistantText ?? null,
				user_message_id: input.userMessageId ?? null,
				ts_unix_ms: input.ts,
			},
			"memory_record_ids",
		);
		return result.ids;
	}

	async runEventRecord(input: {
		dbPath: string;
		runId: string;
		threadId?: string | null;
		stepIndex?: number | null;
		sequence: number;
		eventType: string;
		payload: unknown;
	}): Promise<number> {
		const result = await this.request(
			{
				op: "run_event_record",
				db_path: input.dbPath,
				run_id: input.runId,
				thread_id: input.threadId ?? null,
				step_index: input.stepIndex ?? null,
				sequence: input.sequence,
				event_type: input.eventType,
				payload: input.payload,
			},
			"run_event_id",
		);
		return result.id;
	}

	async runEventList(input: {
		dbPath: string;
		runId: string;
	}): Promise<QuasarRunEventRow[]> {
		const result = await this.request(
			{
				op: "run_event_list",
				db_path: input.dbPath,
				run_id: input.runId,
			},
			"run_event_rows",
		);
		return result.rows;
	}

	async memorySearch(input: {
		dbPath: string;
		query: string;
		limit?: number;
	}): Promise<QuasarMemoryHit[]> {
		const result = await this.request(
			{
				op: "memory_search",
				db_path: input.dbPath,
				query: input.query,
				limit: input.limit ?? 5,
			},
			"memory_hits",
		);
		return result.hits;
	}

	private request<T extends ResponseKind["result"]>(
		kind: RequestKind,
		expected: T,
	): Promise<Extract<ResponseKind, { result: T }>> {
		return requestQuasar({
			actor: this.actor,
			socketPath: this.socketPath,
			timeoutMs: this.timeoutMs,
			kind,
			expected,
		});
	}
}

let singleton: QuasarClient | null = null;

export function getQuasarClient(): QuasarClient {
	if (!singleton) singleton = new QuasarClient();
	return singleton;
}
