import type { GatewayClient } from "@/gateway/protocol";
import type { Session, SessionManager } from "@/session/manager";

export interface SessionHandlerDeps {
	sessions: SessionManager;
	getAuthenticatedNode: (client: GatewayClient) => {
		node_id: string;
		channel: string;
		sender_id: string;
	} | null;
}

export interface SessionListItem {
	id: string;
	key: string;
	name: string;
	created_at: string;
	updated_at: string;
	path: string;
}

export interface SessionGetResult {
	session: SessionListItem;
	messages: number;
	tokens: number;
}

export interface SessionsPatchResult {
	success: boolean;
	session: SessionListItem;
}

export interface SessionsHandlers {
	"sessions.list": (
		_method: string,
		params: unknown,
		_client: GatewayClient,
	) => Promise<{ sessions: SessionListItem[]; total: number }>;
	"sessions.get": (
		_method: string,
		params: unknown,
		_client: GatewayClient,
	) => Promise<SessionGetResult>;
	"sessions.history": (
		_method: string,
		params: unknown,
		_client: GatewayClient,
	) => Promise<{ sessionKey: string; messages: unknown[] }>;
	"sessions.patch": (
		_method: string,
		params: unknown,
		_client: GatewayClient,
	) => Promise<SessionsPatchResult>;
	"sessions.reset": (
		_method: string,
		params: unknown,
		_client: GatewayClient,
	) => Promise<{ success: boolean; sessionKey: string }>;
	"sessions.delete": (
		_method: string,
		params: unknown,
		_client: GatewayClient,
	) => Promise<{ success: boolean; sessionKey: string }>;
	"sessions.create": (
		_method: string,
		params: unknown,
		_client: GatewayClient,
	) => Promise<{ sessionKey: string; session: SessionListItem }>;
	"sessions.compact": (
		_method: string,
		params: unknown,
		_client: GatewayClient,
	) => Promise<{
		success: boolean;
		sessionKey: string;
		summary: string;
		originalMessages: number;
		remainingMessages: number;
	}>;
}

export function validateSessionKey(
	sessionKey: string,
	sessions: SessionManager,
): Session | null {
	return sessions.getOrCreate(sessionKey);
}

export function validateSessionAccess(
	sessionKey: string,
	sessions: SessionManager,
	authenticatedNode: { node_id: string; channel: string; sender_id: string },
): Session {
	const session = sessions.getOrCreate(sessionKey);
	return session;
}

export function createSessionsHandlers(
	deps: SessionHandlerDeps,
): SessionsHandlers {
	const { sessions, getAuthenticatedNode } = deps;

	return {
		"sessions.list": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as { limit?: number; offset?: number } | undefined;
			const allSessions = sessions.listSessions();
			const offset = p?.offset ?? 0;
			const limit = Math.min(p?.limit ?? 100, 500);
			const paginated = allSessions.slice(offset, offset + limit);

			return {
				sessions: paginated as SessionListItem[],
				total: allSessions.length,
			};
		},

		"sessions.get": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as { sessionKey?: string } | undefined;
			const sessionKey = p?.sessionKey;

			if (!sessionKey) {
				throw new Error("sessionKey is required");
			}

			const session = sessions.getOrCreate(sessionKey);
			const sessionInfo = sessions.getSessionListItem(session);

			if (!sessionInfo) {
				throw new Error("Session not found");
			}

			return {
				session: sessionInfo as SessionListItem,
				messages: session.messages.length,
				tokens: session.estimateTokenCount(),
			} as SessionGetResult;
		},

		"sessions.history": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as
				| { sessionKey?: string; maxMessages?: number }
				| undefined;
			const sessionKey = p?.sessionKey;

			if (!sessionKey) {
				throw new Error("sessionKey is required");
			}

			const session = sessions.getOrCreate(sessionKey);
			const maxMessages = p?.maxMessages ?? 500;
			const messages = session.getHistory(maxMessages);

			return {
				sessionKey,
				messages,
			};
		},

		"sessions.patch": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as
				| {
						sessionKey?: string;
						name?: string;
						metadata?: Record<string, unknown>;
				  }
				| undefined;
			const sessionKey = p?.sessionKey;

			if (!sessionKey) {
				throw new Error("sessionKey is required");
			}

			const session = sessions.getOrCreate(sessionKey);

			if (p?.name !== undefined) {
				session.name = p.name;
			}
			if (p?.metadata !== undefined) {
				session.metadata = { ...session.metadata, ...p.metadata };
			}

			sessions.save(session);

			const sessionInfo = sessions.getSessionListItem(session);

			return {
				success: true,
				session: sessionInfo as SessionListItem,
			} as SessionsPatchResult;
		},

		"sessions.reset": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as { sessionKey?: string } | undefined;
			const sessionKey = p?.sessionKey;

			if (!sessionKey) {
				throw new Error("sessionKey is required");
			}

			const session = sessions.getOrCreate(sessionKey);
			session.clear();
			sessions.save(session);

			return {
				success: true,
				sessionKey,
			};
		},

		"sessions.delete": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as { sessionKey?: string } | undefined;
			const sessionKey = p?.sessionKey;

			if (!sessionKey) {
				throw new Error("sessionKey is required");
			}

			sessions.invalidate(sessionKey);

			return {
				success: true,
				sessionKey,
			};
		},

		"sessions.create": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as { sessionKey?: string; name?: string } | undefined;
			const sessionKey = p?.sessionKey ?? `session_${Date.now()}`;

			const session = sessions.getOrCreate(sessionKey);

			if (p?.name !== undefined) {
				session.name = p.name;
			}

			sessions.save(session);

			const sessionInfo = sessions.getSessionListItem(session);

			return {
				sessionKey,
				session: sessionInfo as SessionListItem,
			};
		},

		"sessions.compact": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as
				| { sessionKey?: string; minMessagesToKeep?: number }
				| undefined;
			const sessionKey = p?.sessionKey;

			if (!sessionKey) {
				throw new Error("sessionKey is required");
			}

			const session = sessions.getOrCreate(sessionKey);
			const minMessagesToKeep = p?.minMessagesToKeep ?? 10;

			const summarizeFn = async (messages: unknown[]): Promise<string> => {
				return `[Summary of ${messages.length} messages - placeholder for LLM-based summarization]`;
			};

			const result = await sessions.compactSession(
				session,
				summarizeFn,
				minMessagesToKeep,
			);

			return {
				success: result.success,
				sessionKey,
				summary: result.summary,
				originalMessages: result.originalMessages,
				remainingMessages: result.remainingMessages,
			};
		},
	};
}