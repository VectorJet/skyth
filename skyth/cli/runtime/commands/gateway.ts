import { existsSync } from "node:fs";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { CronService } from "@/cron/service";
import { MessageBus } from "@/bus/queue";
import generalistFactory from "@/agents/generalist_agent/agent";
import { ChannelManager } from "@/channels/manager";
import { evaluateInboundAllowlistPolicy } from "@/channels/policy";
import {
	DEFAULT_HEARTBEAT_INTERVAL_S,
	createHeartbeatRunner,
} from "@/heartbeat";
import { eventLine, type EventKind } from "@/logging/events";
import {
	boolFlag,
	ensureDataDir,
	makeProviderFromConfig,
	strFlag,
} from "@/cli/runtime_helpers";
import { loadConfig, getDataDir } from "@/config/loader";
import { loadModelsDevCatalog } from "@/providers/registry";
import { startGatewayServer } from "@/gateway/server";
import { WebChannel } from "@/channels/web";
import { Config } from "@/config/schema";
import { discoverGateways, formatDiscoveryTable } from "@/gateway/discover";
import {
	isChannelDeliveryTarget,
	loadAllActiveChannelTargets,
	loadLastActiveChannelTarget,
	resolveDeliveryTarget,
	type DeliveryTarget,
} from "@/cli/gateway_delivery";
import { installGatewayLogger } from "@/cli/gateway_logger";
import { MemoryStore } from "@/base/base_agent/memory/store";
import type { CommandContext, CommandHandler } from "@/cli/runtime/types";
import {
	hasIdentityBinary,
	verifyDeviceIdentity,
} from "@/auth/device-fingerprint";
import { authorizeInboundNodeMessage } from "@/auth/cmd/token/runtime-auth";
import {
	getNodeByToken,
	hasDeviceToken,
	listNodes,
	secureCompare,
} from "@/auth/cmd/token/shared";
import {
	formatDateForGateway,
	getTrustedNodeCounts,
	validateGatewayFlags,
	ensureDailySummaryJob as ensureDailySummaryJobHelper,
	type GatewayEmitter,
} from "@/cli/runtime/commands/gateway_helpers";

function localDate(tsMs = Date.now()): string {
	const d = new Date(tsMs);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

// Keep local copy to maintain compatibility with existing call signature
function ensureDailySummaryJob(cron: CronService): void {
	const existing = cron
		.listJobs(true)
		.find(
			(job) =>
				job.name === "daily_summary_nightly" ||
				job.payload.kind === "daily_summary",
		);
	if (existing) return;
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	cron.addJob({
		name: "daily_summary_nightly",
		kind: "daily_summary",
		schedule: { kind: "cron", expr: "55 23 * * *", tz: timezone },
		message: "",
		deliver: false,
	});
}

export const gatewayHandler: CommandHandler = async ({
	positionals,
	flags,
}: CommandContext): Promise<number> => {
	const sub = positionals[1];
	if (sub === "discover") {
		const timeoutRaw =
			strFlag(flags, "timeout_ms") ?? strFlag(flags, "timeout");
		const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
		console.log("Discovering Skyth gateways on the local network...");
		const gateways = await discoverGateways({ timeoutMs });
		console.log(formatDiscoveryTable(gateways));
		return 0;
	}

	const cfg = loadConfig();
	await loadModelsDevCatalog();
	const model = strFlag(flags, "model") ?? cfg.agents.defaults.model;
	const routerModel =
		String(
			(cfg.session_graph as Record<string, unknown>)?.router_model ?? "",
		).trim() || (cfg.use_router ? String(cfg.router_model ?? "").trim() : "");
	const port = Number(strFlag(flags, "port") ?? "18797");
	const verbose = boolFlag(flags, "verbose", false);
	const printLogs = boolFlag(flags, "print_logs", false);
	const cronStore = join(getDataDir(), "cron", "jobs.json");
	const cron = new CronService(cronStore);
	const cronStatus = cron.status();
	const bus = new MessageBus();
	const memory = new MemoryStore(cfg.workspace_path);
	let lastActiveTarget: DeliveryTarget | undefined =
		loadLastActiveChannelTarget(cfg.workspace_path);
	const channelTargets = loadAllActiveChannelTargets(cfg.workspace_path);
	const provider = makeProviderFromConfig(model);
	const channels = new ChannelManager(cfg, bus);
	const lifecycle = generalistFactory.create({
		bus,
		provider,
		workspace: cfg.workspace_path,
		model,
		temperature: cfg.agents.defaults.temperature,
		max_tokens: cfg.agents.defaults.max_tokens,
		max_iterations: cfg.agents.defaults.max_tool_iterations,
		steps: cfg.agents.defaults.steps,
		memory_window: cfg.agents.defaults.memory_window,
		exec_timeout: cfg.tools.exec.timeout,
		restrict_to_workspace: cfg.tools.restrict_to_workspace,
		cron_service: cron,
		router_model: routerModel || undefined,
		enabled_channels: channels.enabledChannels,
		session_graph_config: cfg.session_graph,
	});
	const agent = lifecycle.getRuntime();
	agent.updateChannelTargets(channelTargets);
	const heartbeat = createHeartbeatRunner({
		workspace: cfg.workspace_path,
		config: {
			enabled: true,
			everyMs: DEFAULT_HEARTBEAT_INTERVAL_S * 1000,
		},
		deps: {
			processMessage: async (params) => {
				const target = resolveDeliveryTarget({ fallback: lastActiveTarget });
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
	const emit = (
		kind: EventKind,
		scope: string,
		action: string,
		summary = "",
		details?: Record<string, unknown>,
		sessionKey?: string,
		asError = false,
		skipClamp = false,
	): void => {
		const line = eventLine(kind, scope, action, summary, skipClamp);
		if (asError) console.error(line);
		else console.log(line);
		memory.recordEvent({
			kind,
			scope,
			action,
			summary,
			details,
			session_key: sessionKey,
		});
	};
	let running = true;
	const restoreConsole = installGatewayLogger({ printLogs, verbose });

	try {
		emit(
			"event",
			"gateway",
			"start",
			`port ${String(port)}`,
			undefined,
			undefined,
			false,
			true,
		);
		emit(
			"event",
			"gateway",
			"workspace",
			cfg.workspace_path,
			undefined,
			undefined,
			false,
			true,
		);
		emit("event", "gateway", "model", model, undefined, undefined, false, true);
		emit(
			"cron",
			"gateway",
			"jobs",
			String(cronStatus.jobs),
			undefined,
			undefined,
			false,
			true,
		);
		emit(
			"event",
			"gateway",
			"channels",
			channels.enabledChannels.length
				? channels.enabledChannels.join(",")
				: "none",
			undefined,
			undefined,
			false,
			true,
		);
		if (hasDeviceToken()) {
			const allVerifiedNodes = listNodes().filter((node) => node.mfa_verified);
			const reportableChannels = channels.enabledChannels.filter(
				(ch) =>
					ch !== "email" && ch !== "cli" && ch !== "cron" && ch !== "system",
			);
			const trustedNodes = allVerifiedNodes.filter((node) =>
				reportableChannels.includes(node.channel),
			);

			// Group by channel and count unique sender IDs per channel
			const uniqueChannelSenders = new Map<string, Set<string>>();
			for (const node of trustedNodes) {
				if (!uniqueChannelSenders.has(node.channel)) {
					uniqueChannelSenders.set(node.channel, new Set());
				}
				uniqueChannelSenders.get(node.channel)!.add(node.sender_id);
			}

			let totalUniqueTrusted = 0;
			for (const senders of uniqueChannelSenders.values()) {
				totalUniqueTrusted += senders.size;
			}

			emit(
				"event",
				"gateway",
				"trust",
				`${String(totalUniqueTrusted)} trusted node(s)`,
				undefined,
				undefined,
				false,
				true,
			);
			for (const channelName of channels.enabledChannels) {
				if (
					channelName === "email" ||
					channelName === "cli" ||
					channelName === "cron" ||
					channelName === "system"
				)
					continue;
				const channelTrusted = trustedNodes.filter(
					(node) => node.channel === channelName,
				);
				if (channelTrusted.length) {
					const uniqueSenders = Array.from(
						new Set(channelTrusted.map((node) => node.sender_id)),
					);
					emit(
						"event",
						"gateway",
						"trust",
						`${channelName}: trusted sender(s) ${uniqueSenders.join(",")}`,
						undefined,
						undefined,
						false,
						true,
					);
				} else {
					emit(
						"event",
						"gateway",
						"trust",
						`${channelName}: no trusted nodes`,
						undefined,
						undefined,
						true,
						true,
					);
				}
			}
		} else {
			emit(
				"event",
				"gateway",
				"trust",
				"device token not configured; trust enforcement disabled",
				undefined,
				undefined,
				true,
				true,
			);
		}
		if (verbose) {
			emit(
				"event",
				"gateway",
				"flags",
				`v=${String(verbose)} p=${String(printLogs)}`,
				undefined,
				undefined,
				false,
				true,
			);
		}
		if (lastActiveTarget) {
			emit(
				"event",
				"gateway",
				"target",
				`${lastActiveTarget.channel}:${lastActiveTarget.chatId}`,
				undefined,
				undefined,
				false,
				true,
			);
		}
		if (!channels.enabledChannels.length) {
			emit(
				"event",
				"gateway",
				"abort",
				"no channels",
				undefined,
				undefined,
				true,
				true,
			);
			return 1;
		}

		if (hasIdentityBinary()) {
			const identity = verifyDeviceIdentity();
			if (!identity.valid) {
				emit(
					"event",
					"gateway",
					"abort",
					`device identity failed: ${identity.reason}`,
					undefined,
					undefined,
					true,
					true,
				);
				return 1;
			}
			emit(
				"event",
				"gateway",
				"identity",
				"verified",
				undefined,
				undefined,
				false,
				true,
			);
		}

		ensureDailySummaryJob(cron);
		emit("heartbeat", "gateway", "alive");

		cron.onJob = async (job) => {
			emit("cron", "gateway", "run", String(job.name ?? job.id), {
				jobId: job.id,
			});
			if (job.payload.kind === "daily_summary") {
				const requestedDate = String(job.payload.message ?? "").trim();
				const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
					? requestedDate
					: localDate();
				const summary = memory.writeDailySummary(date);
				emit("cron", "memory", "daily", summary.date, {
					path: summary.path,
					events: summary.eventCount,
				});
				emit("cron", "gateway", "done", String(job.id));
				return `daily summary: ${summary.path}`;
			}
			const target = resolveDeliveryTarget({
				channel: job.payload.channel,
				chatId: job.payload.to,
				fallback: lastActiveTarget,
			});
			const deliverChannel = target?.channel ?? "cli";
			const deliverTo = target?.chatId ?? "cron";
			const response = await agent.processMessage(
				{
					channel: deliverChannel,
					senderId: "cron",
					chatId: deliverTo,
					content: job.payload.message,
					metadata: { source: "cron", cron_job_id: job.id },
				},
				`cron:${job.id}`,
			);
			const autoDeliverSystemEvent = job.payload.kind === "system_event";
			const shouldDeliver =
				Boolean(job.payload.deliver) || autoDeliverSystemEvent;
			if (shouldDeliver && response && target) {
				await bus.publishOutbound({
					...response,
					channel: target.channel,
					chatId: target.chatId,
				});
				emit("cron", "gateway", "send", "delivered");
			} else if (shouldDeliver && !target) {
				emit("cron", "gateway", "drop", "no target");
			}
			emit("cron", "gateway", "done", String(job.id));
			return response?.content;
		};

		const consumer = (async () => {
			while (running) {
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
						lastActiveTarget = {
							channel: normalizedMsg.channel,
							chatId: normalizedMsg.chatId,
						};
						channelTargets.set(normalizedMsg.channel, {
							channel: normalizedMsg.channel,
							chatId: normalizedMsg.chatId,
							ts: Date.now(),
						});
						agent.updateChannelTargets(channelTargets);
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
					let streamCb: import("@/providers/base").StreamCallback | undefined;
					if (normalizedMsg.channel === "web") {
						const webCh = channels.getChannel("web");
						if (webCh instanceof WebChannel) {
							streamCb = (evt) => {
								if (
									evt.type === "text-delta" ||
									evt.type === "reasoning-delta"
								) {
									webCh.streamDelta(normalizedMsg.chatId, {
										type: evt.type,
										text: evt.text,
									});
								} else if (evt.type === "tool-call") {
									webCh.streamDelta(normalizedMsg.chatId, {
										type: evt.type,
										toolCallId: evt.toolCallId,
										toolName: evt.toolName,
										args: evt.args,
									});
								} else if (evt.type === "tool-result") {
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

		const enableWs = !boolFlag(flags, "no_ws", false);
		let webHandler:
			| ((
					req: import("http").IncomingMessage,
					res: import("http").ServerResponse,
			  ) => void | Promise<void>)
			| undefined;

		try {
			const webPath = join(
				process.cwd(),
				"platforms",
				"web",
				"build",
				"handler.js",
			);
			if (existsSync(webPath)) {
				const web = await import(webPath);
				webHandler = web.handler;
				emit(
					"event",
					"gateway",
					"web",
					"enabled",
					undefined,
					undefined,
					false,
					true,
				);
			} else {
				emit(
					"event",
					"gateway",
					"web",
					"not found, run: cd platforms/web && bun run build",
					undefined,
					undefined,
					true,
					true,
				);
			}
		} catch (err) {
			emit(
				"event",
				"gateway",
				"web",
				`error: ${String(err)}`,
				undefined,
				undefined,
				true,
				true,
			);
		}

		let gwServer: Awaited<ReturnType<typeof startGatewayServer>> | null = null;
		if (enableWs || webHandler) {
			const gwHost = cfg.gateway.host;
			const gwPort = port;
			const enableDiscovery = !boolFlag(flags, "no_discovery", false);
			const gwToken =
				strFlag(flags, "gateway_token") ?? process.env.SKYTH_GATEWAY_TOKEN;
			const webChannel = channels.getChannel("web");
			gwServer = await startGatewayServer({
				host: gwHost,
				port: gwPort,
				bus,
				webChannel: webChannel instanceof WebChannel ? webChannel : undefined,
				sessions: agent.sessions,
				enableDiscovery,
				validateToken: (token) => {
					if (gwToken && secureCompare(token, gwToken)) return true;
					// Also allow tokens belonging to registered nodes (like web clients)
					const node = getNodeByToken(token);
					return !!node;
				},
				log: {
					info: (msg) =>
						emit("event", "ws", "info", msg, undefined, undefined, false, true),
					warn: (msg) =>
						emit("event", "ws", "warn", msg, undefined, undefined, true, true),
				},
				webHandler,
			});
			if (gwServer && webChannel instanceof WebChannel) {
				webChannel.setBroadcastFn(gwServer.broadcast);
			}
			emit(
				"event",
				"gateway",
				"server",
				`${gwHost}:${gwPort}`,
				undefined,
				undefined,
				false,
				true,
			);
		} else {
			emit(
				"event",
				"gateway",
				"ws",
				"disabled (no --ws or --web)",
				undefined,
				undefined,
				false,
				true,
			);
		}

		await cron.start();
		heartbeat.start();
		await channels.startAll();

		await new Promise<void>((resolve) => {
			const onSignal = () => resolve();
			process.once("SIGINT", onSignal);
			process.once("SIGTERM", onSignal);
		});
		running = false;
		await consumer;
		if (gwServer) await gwServer.close();
		heartbeat.stop();
		cron.stop();
		await channels.stopAll();
		emit("event", "gateway", "stop", "", undefined, undefined, false, true);
		return 0;
	} finally {
		restoreConsole();
	}
};
