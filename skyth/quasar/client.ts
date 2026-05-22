import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { envFirst, SKYTH_HOME } from "@/gateway/config/env.ts";
import { ensureQuasarDaemon } from "@/quasar/daemon.ts";
import type {
	IpcResponse,
	QuasarMemoryHit,
	QuasarQueueRow,
	RequestKind,
	ResponseKind,
} from "@/quasar/protocol.ts";

export type {
	QuasarMemoryHit,
	QuasarQueueRow,
	QuasarStateTransition,
} from "@/quasar/protocol.ts";

export interface QuasarClientOptions {
	actor?: string;
	socketPath?: string;
	timeoutMs?: number;
}

const DEFAULT_SOCKET = join(SKYTH_HOME, "quasar.sock");

function encodeBase64(value: string | Uint8Array): string {
	const bytes =
		typeof value === "string" ? new TextEncoder().encode(value) : value;
	return Buffer.from(bytes).toString("base64");
}

function decodeBase64(value: string): Uint8Array {
	return new Uint8Array(Buffer.from(value, "base64"));
}

function isConnectMissingSocket(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: string }).code === "ENOENT"
	);
}

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
		this.timeoutMs = options.timeoutMs ?? 2000;
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
		return this.requestOnce(kind, expected).catch(async (error) => {
			if (!isConnectMissingSocket(error) && existsSync(this.socketPath)) {
				throw error;
			}
			await ensureQuasarDaemon(this.socketPath);
			return await this.requestOnce(kind, expected);
		});
	}

	private requestOnce<T extends ResponseKind["result"]>(
		kind: RequestKind,
		expected: T,
	): Promise<Extract<ResponseKind, { result: T }>> {
		const id = crypto.randomUUID();
		const payload = JSON.stringify({ id, actor: this.actor, kind });
		const body = Buffer.from(payload, "utf8");
		const frame = Buffer.allocUnsafe(4 + body.length);
		frame.writeUInt32BE(body.length, 0);
		body.copy(frame, 4);

		return new Promise((resolve, reject) => {
			const socket = createConnection(this.socketPath);
			const chunks: Buffer[] = [];
			let expectedBytes: number | null = null;
			const timer = setTimeout(() => {
				socket.destroy();
				reject(new Error(`quasar ipc timed out after ${this.timeoutMs}ms`));
			}, this.timeoutMs);

			socket.once("connect", () => socket.write(frame));
			socket.on("data", (chunk: Buffer) => {
				chunks.push(chunk);
				const data = Buffer.concat(chunks);
				if (expectedBytes === null && data.length >= 4) {
					expectedBytes = data.readUInt32BE(0);
				}
				if (expectedBytes === null || data.length < 4 + expectedBytes) return;
				clearTimeout(timer);
				socket.end();
				try {
					const response = JSON.parse(
						data.subarray(4, 4 + expectedBytes).toString("utf8"),
					) as IpcResponse;
					if (response.id !== id) {
						throw new Error(`quasar ipc response id mismatch: ${response.id}`);
					}
					if (response.kind.result === "error") {
						throw new Error(response.kind.message);
					}
					if (response.kind.result !== expected) {
						throw new Error(
							`unexpected quasar ipc result ${response.kind.result}; expected ${expected}`,
						);
					}
					resolve(response.kind as Extract<ResponseKind, { result: T }>);
				} catch (err) {
					reject(err);
				}
			});
			socket.once("error", (err: Error) => {
				clearTimeout(timer);
				reject(err);
			});
		});
	}
}

let singleton: QuasarClient | null = null;

export function getQuasarClient(): QuasarClient {
	if (!singleton) singleton = new QuasarClient();
	return singleton;
}
