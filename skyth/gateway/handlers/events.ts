import type { GatewayClient } from "@/gateway/protocol";

export interface GatewayEventDeps {
	broadcast: (event: string, payload: unknown) => void;
	clients: Set<GatewayClient>;
	getAuthenticatedNode: (client: GatewayClient) => {
		node_id: string;
		channel: string;
		sender_id: string;
	} | null;
}

export interface EventPayload {
	[key: string]: unknown;
}

// Event types matching OpenClaw patterns
export type GatewayEvent =
	| "connect.error"
	| "chat.delta"
	| "chat.final"
	| "chat.aborted"
	| "chat.error"
	| "agent.tool"
	| "agent.toolResult"
	| "presence.update"
	| "sessions.changed"
	| "sessions.deleted"
	| "cron.status"
	| "cron.run"
	| "cron.run.complete"
	| "device.pair.requested"
	| "device.pair.resolved"
	| "device.pair.error"
	| "exec.approval.requested"
	| "exec.approval.resolved"
	| "update.available"
	| "shutdown";

export function createEventHandlers(deps: GatewayEventDeps) {
	const { broadcast, clients, getAuthenticatedNode } = deps;

	return {
		// Subscribe to events - for clients that want to receive specific events
		"event.subscribe": async (
			_method: string,
			params: unknown,
			client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as { events?: string[] } | undefined;
			const events = p?.events ?? [];

			// Store subscription (in a real implementation, would track per-client)
			// For now, just acknowledge
			return {
				ok: true,
				subscribed: events,
			};
		},

		// Unsubscribe from events
		"event.unsubscribe": async (
			_method: string,
			params: unknown,
			client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as { events?: string[] } | undefined;
			const events = p?.events ?? [];

			return {
				ok: true,
				unsubscribed: events,
			};
		},

		// Get event history (recent events)
		"event.history": async (
			_method: string,
			params: unknown,
			client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as { limit?: number; event?: string } | undefined;
			const limit = Math.min(p?.limit ?? 50, 200);

			// In a real implementation, would track recent events
			// For now, return empty history
			return {
				events: [],
				total: 0,
			};
		},

		// Ping to test event connectivity
		"event.ping": async (
			_method: string,
			_params: unknown,
			client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(client);
			if (!node) {
				throw new Error("authentication required");
			}

			// Send a ping event back to confirm connectivity
			broadcast("event.pong", {
				timestamp: Date.now(),
				connId: client.connId,
			});

			return {
				timestamp: Date.now(),
			};
		},
	};
}

// Helper functions to emit events from other parts of the system
export interface EventEmitter {
	emitChatDelta: (sessionKey: string, delta: string) => void;
	emitChatFinal: (sessionKey: string, message: unknown) => void;
	emitChatAborted: (sessionKey: string, reason: string) => void;
	emitChatError: (sessionKey: string, error: string) => void;
	emitAgentTool: (sessionKey: string, toolCall: unknown) => void;
	emitAgentToolResult: (sessionKey: string, result: unknown) => void;
	emitPresenceUpdate: (presence: Record<string, unknown>) => void;
	emitSessionsChanged: (sessionKey: string) => void;
	emitSessionsDeleted: (sessionKey: string) => void;
	emitCronStatus: (status: Record<string, unknown>) => void;
	emitCronRun: (jobId: string, status: string) => void;
	emitCronRunComplete: (jobId: string, result: unknown) => void;
	emitDevicePairRequested: (request: Record<string, unknown>) => void;
	emitDevicePairResolved: (result: Record<string, unknown>) => void;
	emitDevicePairError: (error: Record<string, unknown>) => void;
	emitExecApprovalRequested: (approval: Record<string, unknown>) => void;
	emitExecApprovalResolved: (resolution: Record<string, unknown>) => void;
	emitUpdateAvailable: (update: Record<string, unknown>) => void;
	emitShutdown: (reason: string) => void;
	emitConnectError: (error: Record<string, unknown>) => void;
}

export function createEventEmitter(broadcast: (event: string, payload: unknown) => void): EventEmitter {
	return {
		emitChatDelta: (sessionKey, delta) => {
			broadcast("chat.delta", { sessionKey, delta, timestamp: Date.now() });
		},
		emitChatFinal: (sessionKey, message) => {
			broadcast("chat.final", { sessionKey, message, timestamp: Date.now() });
		},
		emitChatAborted: (sessionKey, reason) => {
			broadcast("chat.aborted", { sessionKey, reason, timestamp: Date.now() });
		},
		emitChatError: (sessionKey, error) => {
			broadcast("chat.error", { sessionKey, error, timestamp: Date.now() });
		},
		emitAgentTool: (sessionKey, toolCall) => {
			broadcast("agent.tool", { sessionKey, toolCall, timestamp: Date.now() });
		},
		emitAgentToolResult: (sessionKey, result) => {
			broadcast("agent.toolResult", { sessionKey, result, timestamp: Date.now() });
		},
		emitPresenceUpdate: (presence: Record<string, unknown>) => {
			broadcast("presence.update", { ...presence, timestamp: Date.now() });
		},
		emitSessionsChanged: (sessionKey) => {
			broadcast("sessions.changed", { sessionKey, timestamp: Date.now() });
		},
		emitSessionsDeleted: (sessionKey) => {
			broadcast("sessions.deleted", { sessionKey, timestamp: Date.now() });
		},
		emitCronStatus: (status: Record<string, unknown>) => {
			broadcast("cron.status", { ...status, timestamp: Date.now() });
		},
		emitCronRun: (jobId, status) => {
			broadcast("cron.run", { jobId, status, timestamp: Date.now() });
		},
		emitCronRunComplete: (jobId, result) => {
			broadcast("cron.run.complete", { jobId, result, timestamp: Date.now() });
		},
		emitDevicePairRequested: (request: Record<string, unknown>) => {
			broadcast("device.pair.requested", { ...request, timestamp: Date.now() });
		},
		emitDevicePairResolved: (result: Record<string, unknown>) => {
			broadcast("device.pair.resolved", { ...result, timestamp: Date.now() });
		},
		emitDevicePairError: (error: Record<string, unknown>) => {
			broadcast("device.pair.error", { ...error, timestamp: Date.now() });
		},
		emitExecApprovalRequested: (approval: Record<string, unknown>) => {
			broadcast("exec.approval.requested", { ...approval, timestamp: Date.now() });
		},
		emitExecApprovalResolved: (resolution: Record<string, unknown>) => {
			broadcast("exec.approval.resolved", { ...resolution, timestamp: Date.now() });
		},
		emitUpdateAvailable: (update: Record<string, unknown>) => {
			broadcast("update.available", { ...update, timestamp: Date.now() });
		},
		emitShutdown: (reason) => {
			broadcast("shutdown", { reason, timestamp: Date.now() });
		},
		emitConnectError: (error: Record<string, unknown>) => {
			broadcast("connect.error", { ...error, timestamp: Date.now() });
		},
	};
}