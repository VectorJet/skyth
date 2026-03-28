import type { AgentLoop } from "@/base/base_agent/runtime";
import { createHeartbeatRunner, DEFAULT_HEARTBEAT_INTERVAL_S } from "@/heartbeat";
import type { DeliveryTarget } from "@/cli/gateway_delivery";
import { resolveDeliveryTarget } from "@/cli/gateway_delivery";
import type { MessageBus } from "@/bus/queue";
import type { EmitFn } from "./utils";

export interface HeartbeatDeps {
	agent: AgentLoop;
	bus: MessageBus;
	emit: EmitFn;
}

export interface HeartbeatParams {
	workspace: string;
	lastActiveTargetRef: { current: DeliveryTarget | undefined };
}

export function createGatewayHeartbeat(
	{ agent, bus, emit }: HeartbeatDeps,
	{ workspace, lastActiveTargetRef }: HeartbeatParams,
) {
	return createHeartbeatRunner({
		workspace,
		config: {
			enabled: true,
			everyMs: DEFAULT_HEARTBEAT_INTERVAL_S * 1000,
		},
		deps: {
			processMessage: async (params) => {
				const target = resolveDeliveryTarget({ fallback: lastActiveTargetRef.current });
				const channel = target?.channel ?? "cli";
				const chatId = target?.chatId ?? "heartbeat";
				const response = await agent.processMessage(
					{
						channel,
						senderId: params.senderId,
						chatId,
						content: params.content,
						metadata: params.metadata,
					},
					"heartbeat",
				);
				if (response && target) {
					await bus.publishOutbound({
						...response,
						channel: target.channel,
						chatId: target.chatId,
					});
					emit("heartbeat", "gateway", "send", "delivered");
				}
				return response ?? null;
			},
		},
	});
}