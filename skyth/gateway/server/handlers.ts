import type { MessageBus } from "@/bus/queue";
import type { GatewayClient } from "@/gateway/protocol";
import { getNodeByToken } from "@/auth/cmd/token/shared";
import type { SessionManager } from "@/session/manager";
import type { ToolRegistry } from "@/registries/tool_registry";
import type { AgentRegistry } from "@/registries/agent_registry";
import type { ChannelManager } from "@/channels/manager";
import type { CronService } from "@/cron/service";
import type { Config } from "@/config/schema";

interface HandlerDeps {
	bus: MessageBus;
	clients: Set<GatewayClient>;
	validateToken: (token: string) => boolean;
	getAuthenticatedNode: (client: GatewayClient) => {
		node_id: string;
		channel: string;
		sender_id: string;
	} | null;
	sessions?: SessionManager;
	toolRegistry?: ToolRegistry;
	agentRegistry?: AgentRegistry;
	channelManager?: ChannelManager;
	cronService?: CronService;
	cfg?: Config;
}

interface HandlerFactories {
	sessionsHandlers: ReturnType<
		typeof import("@/gateway/handlers").createSessionsHandlers
	>;
	toolsHandlers: ReturnType<
		typeof import("@/gateway/handlers").createToolsHandlers
	> | null;
	agentsHandlers: ReturnType<
		typeof import("@/gateway/handlers").createAgentsHandlers
	> | null;
	modelsHandlers: ReturnType<
		typeof import("@/gateway/handlers").createModelsHandlers
	>;
	configHandlers: ReturnType<
		typeof import("@/gateway/handlers").createConfigHandlers
	>;
	channelsHandlers: ReturnType<
		typeof import("@/gateway/handlers").createChannelsHandlers
	> | null;
	cronHandlers: ReturnType<
		typeof import("@/gateway/handlers").createCronHandlers
	> | null;
	healthHandlers: ReturnType<
		typeof import("@/gateway/handlers").createHealthHandlers
	>;
	execApprovalHandlers: ReturnType<
		typeof import("@/gateway/handlers").createExecApprovalHandlers
	>;
	eventHandlers: ReturnType<
		typeof import("@/gateway/handlers").createEventHandlers
	>;
}

export function createRequestHandler(
	deps: HandlerDeps,
	factories: HandlerFactories,
) {
	const { bus, clients, getAuthenticatedNode } = deps;
	const {
		sessionsHandlers,
		toolsHandlers,
		agentsHandlers,
		modelsHandlers,
		configHandlers,
		channelsHandlers,
		cronHandlers,
		healthHandlers,
		execApprovalHandlers,
		eventHandlers,
	} = factories;

	return async function handleRequest(
		method: string,
		params: unknown,
		client: GatewayClient,
	): Promise<unknown> {
		if (method === "health") {
			return {
				status: "ok",
				clients: clients.size,
				uptime: process.uptime(),
			};
		}
		if (method === "status") {
			return {
				clients: clients.size,
				inboundQueue: bus.inboundSize,
				outboundQueue: bus.outboundSize,
			};
		}
		if (method === "chat.send") {
			const p = params as
				| { content?: string; channel?: string; chatId?: string }
				| undefined;
			if (!p?.content) {
				throw new Error("content is required");
			}
			const authToken = String(client.metadata?.auth_token ?? "").trim();
			const node = getNodeByToken(authToken);
			if (!node) {
				throw new Error("trusted node authentication required");
			}
			if (p.channel && p.channel !== node.channel) {
				throw new Error("channel does not match authenticated node");
			}
			await bus.publishInbound({
				channel: node.channel,
				senderId: node.sender_id,
				chatId: p.chatId ?? node.sender_id,
				content: p.content,
				metadata: {
					source: "gateway",
					connId: client.connId,
					node_id: node.id,
					node_token_verified: true,
				},
			});
			return { queued: true };
		}
		if (method === "chat.abort") {
			const p = params as { sessionKey?: string; runId?: string } | undefined;
			const sessionKey = p?.sessionKey;
			if (!sessionKey) {
				throw new Error("sessionKey is required");
			}
			return { ok: true, status: "aborted", sessionKey };
		}

		// Delegate to session handlers
		if (method in sessionsHandlers) {
			return sessionsHandlers[method as keyof typeof sessionsHandlers](
				method,
				params,
				client,
			);
		}
		// Delegate to tools handlers
		if (toolsHandlers && method in toolsHandlers) {
			return toolsHandlers[method as keyof typeof toolsHandlers](
				method,
				params,
				client,
			);
		}
		// Delegate to agents handlers
		if (agentsHandlers && method in agentsHandlers) {
			return agentsHandlers[method as keyof typeof agentsHandlers](
				method,
				params,
				client,
			);
		}
		// Delegate to models handlers
		if (modelsHandlers && method in modelsHandlers) {
			return modelsHandlers[method as keyof typeof modelsHandlers](
				method,
				params,
				client,
			);
		}
		// Delegate to config handlers
		if (configHandlers && method in configHandlers) {
			return configHandlers[method as keyof typeof configHandlers](
				method,
				params,
				client,
			);
		}
		// Delegate to channels handlers
		if (channelsHandlers && method in channelsHandlers) {
			return channelsHandlers[method as keyof typeof channelsHandlers](
				method,
				params,
				client,
			);
		}
		// Delegate to cron handlers
		if (cronHandlers && method in cronHandlers) {
			return cronHandlers[method as keyof typeof cronHandlers](
				method,
				params,
				client,
			);
		}
		// Delegate to health handlers
		if (method in healthHandlers) {
			return healthHandlers[method as keyof typeof healthHandlers](
				method,
				params,
				client,
			);
		}
		// Delegate to exec-approval handlers
		if (method in execApprovalHandlers) {
			return execApprovalHandlers[method as keyof typeof execApprovalHandlers](
				method,
				params,
				client,
			);
		}
		// Delegate to event handlers
		if (method in eventHandlers) {
			return eventHandlers[method as keyof typeof eventHandlers](
				method,
				params,
				client,
			);
		}
		throw new Error(`unknown method: ${method}`);
	};
}
