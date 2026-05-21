import { createConnection } from "node:net";
import { join } from "node:path";
import { envFirst, SKYTH_HOME } from "@/gateway/config/env.ts";

type RequestKind =
	| { op: "ping" }
	| { op: "status" }
	| {
			op: "db_open";
			db_path: string;
			db_kind: string;
			create_if_missing: boolean;
	  }
	| { op: "vfs_read"; db_path: string; namespace: string; path: string }
	| {
			op: "vfs_write";
			db_path: string;
			namespace: string;
			path: string;
			content_b64: string;
	  }
	| { op: "vfs_delete"; db_path: string; namespace: string; path: string }
	| { op: "vfs_list"; db_path: string; namespace: string }
	| { op: "heartbeat_append"; kind: string; note?: string | null }
	| {
			op: "cron_register";
			schedule: string;
			target_agent_id: string;
			payload: unknown;
	  }
	| {
			op: "queue_push_user";
			db_path: string;
			payload: string;
			ts: number;
			enqueued_at: number;
	  }
	| {
			op: "queue_push_gateway";
			db_path: string;
			payload: string;
			tag?: string | null;
			ts: number;
			enqueued_at: number;
	  }
	| { op: "queue_claim_all"; db_path: string }
	| { op: "queue_mark_done"; db_path: string; ids: number[] }
	| { op: "queue_release_inflight"; db_path: string; ids: number[] }
	| { op: "queue_pending_stats"; db_path: string };

type ResponseKind =
	| { result: "pong" }
	| { result: "status"; version: string; auth_initialized: boolean }
	| { result: "db_opened"; db_path: string; db_kind: string }
	| { result: "vfs_bytes"; content_b64?: string | null }
	| { result: "vfs_event_id"; event_id: number }
	| { result: "vfs_entries"; entries: unknown[] }
	| { result: "queue_row_id"; id: number }
	| { result: "queue_rows"; rows: QuasarQueueRow[] }
	| { result: "queue_stats"; stats: { user: number; gateway: number } }
	| { result: "ok" }
	| { result: "error"; message: string };

export interface QuasarQueueRow {
	id: number;
	kind: "user" | "gateway";
	payload: string;
	tag: string | null;
	ts: number;
	enqueued_at: number;
	status: "pending" | "inflight" | "done";
}

interface IpcResponse {
	id: string;
	kind: ResponseKind;
}

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

	private request<T extends ResponseKind["result"]>(
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
