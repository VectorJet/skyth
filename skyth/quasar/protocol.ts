export type RequestKind =
	| { op: "ping" }
	| { op: "status" }
	| { op: "onboard"; username: string; password_b64: string }
	| { op: "unlock"; password_b64: string }
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
	| { op: "queue_pending_stats"; db_path: string }
	| {
			op: "state_record";
			db_path: string;
			domain: string;
			from_state?: string | null;
			to_state: string;
			reason?: string | null;
			metadata: unknown;
	  }
	| { op: "state_latest"; db_path: string; domain: string }
	| {
			op: "memory_record_gateway_turn";
			db_path: string;
			channel: string;
			chat_id: string;
			user_text?: string | null;
			assistant_text?: string | null;
			user_message_id?: string | null;
			ts_unix_ms: number;
	  }
	| { op: "memory_search"; db_path: string; query: string; limit: number }
	| {
			op: "run_event_record";
			db_path: string;
			run_id: string;
			thread_id?: string | null;
			step_index?: number | null;
			sequence: number;
			event_type: string;
			payload: unknown;
	  }
	| { op: "run_event_list"; db_path: string; run_id: string };

export type ResponseKind =
	| { result: "pong" }
	| { result: "status"; version: string; auth_initialized: boolean }
	| { result: "db_opened"; db_path: string; db_kind: string }
	| { result: "vfs_bytes"; content_b64?: string | null }
	| { result: "vfs_event_id"; event_id: number }
	| { result: "vfs_entries"; entries: unknown[] }
	| { result: "queue_row_id"; id: number }
	| { result: "queue_rows"; rows: QuasarQueueRow[] }
	| { result: "queue_stats"; stats: { user: number; gateway: number } }
	| { result: "state_transition_id"; id: number }
	| { result: "state_transition"; transition: QuasarStateTransition | null }
	| { result: "memory_record_ids"; ids: number[] }
	| { result: "memory_hits"; hits: QuasarMemoryHit[] }
	| { result: "run_event_id"; id: number }
	| { result: "run_event_rows"; rows: QuasarRunEventRow[] }
	| { result: "ok" }
	| { result: "error"; message: string };

export interface QuasarRunEventRow {
	id: number;
	ts_unix_ms: number;
	actor: string;
	run_id: string;
	thread_id: string | null;
	step_index: number | null;
	sequence: number;
	event_type: string;
	payload: unknown;
}

export interface QuasarQueueRow {
	id: number;
	kind: "user" | "gateway";
	payload: string;
	tag: string | null;
	ts: number;
	enqueued_at: number;
	status: "pending" | "inflight" | "done";
}

export interface QuasarStateTransition {
	id: number;
	ts_unix_ms: number;
	actor: string;
	domain: string;
	from_state: string | null;
	to_state: string;
	reason: string | null;
	metadata: unknown;
}

export interface QuasarMemoryHit {
	id: number;
	thread_id: string;
	source: string;
	role: string;
	text: string;
	snippet: string;
	rank: number;
	ts_unix_ms: number;
}

export interface IpcResponse {
	id: string;
	kind: ResponseKind;
}
