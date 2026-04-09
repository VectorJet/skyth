import type { GatewayClient } from "@/gateway/protocol";
import { getNodeByToken } from "@/auth/cmd/token/shared";

export const GATEWAY_METHODS = [
	"chat.send",
	"chat.history",
	"chat.abort",
	"health",
	"status",
	// Sessions
	"sessions.list",
	"sessions.get",
	"sessions.history",
	"sessions.patch",
	"sessions.reset",
	"sessions.delete",
	"sessions.create",
	"sessions.compact",
	// Tools
	"tools.catalog",
	"tools.effective",
	// Agents
	"agents.list",
	"agents.identity",
	"agents.files.list",
	"agents.files.get",
	"agents.files.set",
	// Models
	"models.catalog",
	"models.selected",
	"models.select",
	// Config
	"config.snapshot",
	"config.schema",
	"config.apply",
	"config.validate",
	// Channels
	"channels.status",
	"channels.configure",
	// Cron
	"cron.status",
	"cron.jobs.list",
	"cron.jobs.get",
	"cron.jobs.set",
	"cron.jobs.delete",
	"cron.runs.list",
	// Health
	"health.summary",
	"health.probe",
	"presence.list",
	// Exec Approvals
	"exec.approval.request",
	"exec.approval.waitDecision",
	"exec.approval.resolve",
	"exec.approval.list",
	// Events
	"event.subscribe",
	"event.unsubscribe",
	"event.history",
	"event.ping",
] as const;

export type AuthenticatedNodeGetter = (client: GatewayClient) => {
	node_id: string;
	channel: string;
	sender_id: string;
} | null;

export function createNodeGetter(metadataKey: string): AuthenticatedNodeGetter {
	return (client: GatewayClient) => {
		const authToken = String(client.metadata?.[metadataKey] ?? "").trim();
		const node = getNodeByToken(authToken);
		return node
			? { node_id: node.id, channel: node.channel, sender_id: node.sender_id }
			: null;
	};
}

export function createBroadcast(clients: Set<GatewayClient>) {
	return (event: string, payload?: unknown) => {
		const frame = JSON.stringify({ type: "event", event, payload });
		for (const client of clients) {
			if (client.authenticatedAt) {
				try {
					client.socket.send(frame);
				} catch {
					/* skip dead connections */
				}
			}
		}
	};
}

export type BroadcastFn = (event: string, payload?: unknown) => void;
