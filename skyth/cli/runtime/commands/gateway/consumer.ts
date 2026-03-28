import type { AgentLoop } from "@/base/base_agent/runtime";
import type { MessageBus } from "@/bus/queue";
import type { ChannelManager } from "@/channels/manager";
import type { Config } from "@/config/schema";
import { authorizeInboundNodeMessage } from "@/auth/cmd/token/runtime-auth";
import { evaluateInboundAllowlistPolicy } from "@/channels/policy";
import { WebChannel } from "@/channels/web";
import type { DeliveryTarget } from "@/cli/gateway_delivery";
import { isChannelDeliveryTarget } from "@/cli/gateway_delivery";
import type { EmitFn } from "./utils";
import type { StreamCallback } from "@/providers/base";

export interface ConsumerDeps {
	agent: AgentLoop;
	bus: MessageBus;
	channels: ChannelManager;
	cfg: Config;
	emit: EmitFn;
}

export interface ConsumerParams {
	runningRef: { current: boolean };
	lastActiveTargetRef: { current: DeliveryTarget | undefined };
	channelTargetsRef: { current: Map<string, DeliveryTarget & { ts: number }> };
}

export function createConsumer(
	{ agent, bus, channels, cfg, emit }: ConsumerDeps,
	{ runningRef, lastActiveTargetRef, channelTargetsRef }: ConsumerParams,
) {
	return (async () => {
		while (runningRef.current) {
			const msg = await bus.consumeInboundWithTimeout(250);
			if (!msg) continue;
			try {
				emit("event", msg.channel, "receive", msg.content, {
					sender: msg.senderId,
					chat: msg.chatId,
				});
				const policy = evaluateInboundAllowlistPolicy(cfg, msg);
				if (!policy.allowed) {
					emit("event", msg.channel, "block", policy.reason || "allowlist");
					continue;
				}

				const auth = authorizeInboundNodeMessage({
					channel: msg.channel,
					senderId: msg.senderId,
					content: msg.content,
					metadata: msg.metadata as Record<string, unknown> | undefined,
				});
				if (!auth.allowed) {
					emit("event", msg.channel, "block", auth.reason || "node auth");
					continue;
				}

				const normalizedMsg = {
					...msg,
					content: auth.content,
					metadata: {
						...(msg.metadata ?? {}),
						node_auth: {
							verified: true,
							node_id: auth.nodeId,
						},
					},
				};

				if (isChannelDeliveryTarget(normalizedMsg.channel)) {
					lastActiveTargetRef.current = {
						channel: normalizedMsg.channel,
						chatId: normalizedMsg.chatId,
					};
					channelTargetsRef.current.set(normalizedMsg.channel, {
						channel: normalizedMsg.channel,
						chatId: normalizedMsg.chatId,
						ts: Date.now(),
					});
					agent.updateChannelTargets(channelTargetsRef.current);
				}
				emit(
					"event",
					"gateway",
					"allow",
					normalizedMsg.channel,
					undefined,
					undefined,
					false,
					true,
				);
				let streamCb: StreamCallback | undefined;
				if (normalizedMsg.channel === "web") {
					const webCh = channels.getChannel("web");
					if (webCh instanceof WebChannel) {
						streamCb = (evt) => {
							if (
								evt.type === "text-delta" ||
								evt.type === "reasoning-delta"
							) {
								emit(
									"event",
									"gateway",
									"stream",
									`${evt.type} ${evt.text.slice(0, 50)}`,
									undefined,
									normalizedMsg.chatId,
									false,
									true,
								);
								webCh.streamDelta(normalizedMsg.chatId, {
									type: evt.type,
									text: evt.text,
								});
							} else if (evt.type === "tool-call") {
								emit(
									"event",
									"gateway",
									"stream",
									`tool-call ${evt.toolName}`,
									undefined,
									normalizedMsg.chatId,
									false,
									true,
								);
								webCh.streamDelta(normalizedMsg.chatId, {
									type: evt.type,
									toolCallId: evt.toolCallId,
									toolName: evt.toolName,
									args: evt.args,
								});
							} else if (evt.type === "tool-result") {
								emit(
									"event",
									"gateway",
									"stream",
									`tool-result ${evt.toolCallId.slice(0, 8)}`,
									undefined,
									normalizedMsg.chatId,
									false,
									true,
								);
								webCh.streamDelta(normalizedMsg.chatId, {
									type: evt.type,
									toolCallId: evt.toolCallId,
									result: evt.result,
								});
							}
						};
					}
				}
				Promise.resolve().then(async () => {
					try {
						const response = await agent.processMessage(
							normalizedMsg,
							undefined,
							streamCb,
						);
						if (response) {
							await bus.publishOutbound(response);
							emit("event", response.channel, "send", response.content, {
								chat: response.chatId,
							});
							if (normalizedMsg.channel === "web") {
								const webCh = channels.getChannel("web");
								if (webCh instanceof WebChannel) {
									webCh.streamFinal(normalizedMsg.chatId, {
										text: response?.content,
										stopReason: "stop",
									});
									emit(
										"event",
										"gateway",
										"chat.final",
										response?.content?.slice(0, 50) ?? "",
										undefined,
										normalizedMsg.chatId,
										false,
										true,
									);
								}
							}
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						emit(
							"event",
							"gateway",
							"error",
							message,
							undefined,
							undefined,
							undefined,
							true,
						);
						if (normalizedMsg.channel === "web") {
							const webCh = channels.getChannel("web");
							if (webCh instanceof WebChannel) {
								webCh.streamFinal(normalizedMsg.chatId, {
									errorMessage: message,
								});
								emit(
									"event",
									"gateway",
									"chat.error",
									message.slice(0, 50),
									undefined,
									normalizedMsg.chatId,
									false,
									true,
								);
							}
						}
					}
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				emit(
					"event",
					"gateway",
					"error",
					message,
					undefined,
					undefined,
					undefined,
					true,
				);
			}
		}
	})();
}