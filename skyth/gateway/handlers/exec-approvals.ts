import { randomBytes } from "node:crypto";
import type { GatewayClient } from "@/gateway/protocol";

export interface ExecApprovalRequest {
	id: string;
	command: string;
	commandPreview?: string;
	commandArgv?: string[];
	cwd?: string;
	host?: string;
	security?: string;
	ask?: string;
	agentId?: string;
	sessionKey?: string;
	createdAtMs: number;
	expiresAtMs: number;
	requestedBy?: {
		connId?: string;
		deviceId?: string;
		clientId?: string;
	};
}

export interface ExecApprovalRecord extends ExecApprovalRequest {
	resolved: boolean;
	resolvedBy?: string;
	resolvedAtMs?: number;
	decision?: "allow-once" | "allow-always" | "deny";
}

export interface ExecApprovalHandlerDeps {
	broadcast: (event: string, payload: unknown) => void;
	getAuthenticatedNode: (client: GatewayClient) => {
		node_id: string;
		channel: string;
		sender_id: string;
	} | null;
}

const DEFAULT_TIMEOUT_MS = 60000; // 1 minute

export function createExecApprovalHandlers(deps: ExecApprovalHandlerDeps) {
	const { broadcast, getAuthenticatedNode } = deps;

	// In-memory store for pending approvals (in production would persist to disk)
	const pendingApprovals = new Map<string, ExecApprovalRecord>();
	const pendingByShortId = new Map<string, string[]>(); // short prefix -> full IDs

	function generateId(): string {
		// 🛡️ Sentinel: Use cryptographically secure random number generator instead of Math.random() for sensitive approval IDs
		return `approval_${Date.now()}_${randomBytes(8).toString("hex")}`;
	}

	function addPending(record: ExecApprovalRecord): void {
		pendingApprovals.set(record.id, record);
		// Track short prefix for lookup
		const shortPrefix = record.id.slice(0, 8);
		const existing = pendingByShortId.get(shortPrefix) || [];
		existing.push(record.id);
		pendingByShortId.set(shortPrefix, existing);
	}

	function resolvePending(
		id: string,
		decision: "allow-once" | "allow-always" | "deny",
		resolvedBy?: string,
	): ExecApprovalRecord | null {
		const record = pendingApprovals.get(id);
		if (!record || record.resolved) {
			return null;
		}
		record.resolved = true;
		record.decision = decision;
		record.resolvedBy = resolvedBy ?? undefined;
		record.resolvedAtMs = Date.now();

		// Clean up short prefix index
		const shortPrefix = id.slice(0, 8);
		const existing = pendingByShortId.get(shortPrefix);
		if (existing) {
			const filtered = existing.filter((i) => i !== id);
			if (filtered.length > 0) {
				pendingByShortId.set(shortPrefix, filtered);
			} else {
				pendingByShortId.delete(shortPrefix);
			}
		}

		return record;
	}

	function lookupPendingId(id: string): { kind: "none" } | { kind: "found"; id: string } | { kind: "ambiguous"; ids: string[] } {
		const trimmed = id.trim();
		if (!trimmed) {
			return { kind: "none" };
		}
		// Exact match
		if (pendingApprovals.has(trimmed)) {
			return { kind: "found", id: trimmed };
		}
		// Prefix match
		const shortPrefix = trimmed.slice(0, 8);
		const matches = pendingByShortId.get(shortPrefix) || [];
		if (matches.length === 0) {
			return { kind: "none" };
		}
		if (matches.length === 1) {
			return { kind: "found", id: matches[0] as string };
		}
		return { kind: "ambiguous", ids: matches };
	}

	const waitingPromises = new Map<string, {
		resolve: (decision: ExecApprovalRecord["decision"] | null) => void;
		reject: (err: Error) => void;
	}>();

	function awaitDecision(id: string): Promise<ExecApprovalRecord["decision"] | null> | null {
		const record = pendingApprovals.get(id);
		if (!record || record.resolved) {
			return null;
		}
		return new Promise((resolve, reject) => {
			waitingPromises.set(id, { resolve, reject });
			// Auto-expire after timeout
			setTimeout(() => {
				if (waitingPromises.has(id)) {
					waitingPromises.delete(id);
					// Expire the record
					record.resolved = true;
					record.decision = undefined;
					record.resolvedAtMs = Date.now();
					resolve(null);
				}
			}, DEFAULT_TIMEOUT_MS);
		});
	}

	return {
		"exec.approval.request": async (
			_method: string,
			params: unknown,
			client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as {
				command?: string;
				commandArgv?: string[];
				commandPreview?: string;
				cwd?: string;
				host?: string;
				security?: string;
				ask?: string;
				agentId?: string;
				sessionKey?: string;
				timeoutMs?: number;
			} | undefined;

			const commandRaw = p?.command;
			if (!commandRaw || typeof commandRaw !== "string") {
				throw new Error("command is required");
			}
			const command = commandRaw;

			const commandPreview = p?.commandPreview;
			const id = generateId();
			const timeoutMs = p?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
			const expiresAtMs = Date.now() + timeoutMs;

			const record: ExecApprovalRecord = {
				id,
				command: commandPreview ?? command,
				commandPreview: p.commandPreview,
				commandArgv: p.commandArgv,
				cwd: p.cwd,
				host: p.host,
				security: p.security,
				ask: p.ask,
				agentId: p.agentId,
				sessionKey: p.sessionKey,
				createdAtMs: Date.now(),
				expiresAtMs,
				requestedBy: {
					connId: client.connId,
				},
				resolved: false,
			};

			addPending(record);

			// Broadcast the approval request
			broadcast("exec.approval.requested", {
				id: record.id,
				command: record.command,
				commandPreview: record.commandPreview,
				createdAtMs: record.createdAtMs,
				expiresAtMs: record.expiresAtMs,
			});

			// Wait for decision
			const decision = await awaitDecision(id);

			return {
				id: record.id,
				decision,
				createdAtMs: record.createdAtMs,
				expiresAtMs: record.expiresAtMs,
			};
		},

		"exec.approval.waitDecision": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as { id?: string } | undefined;
			const id = p?.id;

			if (!id) {
				throw new Error("id is required");
			}

			const decisionPromise = awaitDecision(id);
			if (!decisionPromise) {
				const record = pendingApprovals.get(id);
				if (record?.resolved) {
					// Already resolved
					return {
						id,
						decision: record.decision,
						createdAtMs: record.createdAtMs,
						expiresAtMs: record.expiresAtMs,
					};
				}
				throw new Error("approval expired or not found");
			}

			const decision = await decisionPromise;
			const record = pendingApprovals.get(id);

			return {
				id,
				decision,
				createdAtMs: record?.createdAtMs,
				expiresAtMs: record?.expiresAtMs,
			};
		},

		"exec.approval.resolve": async (
			_method: string,
			params: unknown,
			client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as { id?: string; decision?: string } | undefined;
			const id = p?.id;
			const decision = p?.decision as "allow-once" | "allow-always" | "deny" | undefined;

			if (!id) {
				throw new Error("id is required");
			}

			if (!decision) {
				throw new Error("decision is required");
			}

			if (decision !== "allow-once" && decision !== "allow-always" && decision !== "deny") {
				throw new Error("invalid decision - must be allow-once, allow-always, or deny");
			}

			const resolvedId = lookupPendingId(id);
			if (resolvedId.kind === "none") {
				throw new Error("unknown or expired approval id");
			}
			if (resolvedId.kind === "ambiguous") {
				const candidates = resolvedId.ids.slice(0, 3).join(", ");
				const remainder = resolvedId.ids.length > 3 ? ` (+${resolvedId.ids.length - 3} more)` : "";
				throw new Error(`ambiguous approval id prefix; matches: ${candidates}${remainder}. Use the full id.`);
			}

			const resolved = resolvePending(decision, decision, client.connId);
			if (!resolved) {
				throw new Error("unknown or expired approval id");
			}

			// Resolve any waiting promise
			const waiter = waitingPromises.get(resolvedId.id);
			if (waiter) {
				waitingPromises.delete(resolvedId.id);
				waiter.resolve(decision);
			}

			// Broadcast the resolution
			broadcast("exec.approval.resolved", {
				id: resolvedId.id,
				decision,
				resolvedBy: client.connId,
				ts: Date.now(),
			});

			return { ok: true };
		},

		"exec.approval.list": async (
			_method: string,
			_params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const pending: Array<{
				id: string;
				command: string;
				commandPreview?: string;
				createdAtMs: number;
				expiresAtMs: number;
			}> = [];

			for (const [id, record] of pendingApprovals) {
				if (!record.resolved) {
					pending.push({
						id,
						command: record.command,
						commandPreview: record.commandPreview,
						createdAtMs: record.createdAtMs,
						expiresAtMs: record.expiresAtMs,
					});
				}
			}

			// Sort by expiration (soonest first)
			pending.sort((a, b) => a.expiresAtMs - b.expiresAtMs);

			return {
				pending,
				total: pending.length,
			};
		},
	};
}