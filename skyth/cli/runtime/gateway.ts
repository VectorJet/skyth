import { join } from "node:path";
import { channelsEditCommand, channelsStatusCommand, pairingTelegramCommand, statusCommand } from "@/cli/commands";
import { getDataDir, loadConfig } from "@/config/loader";
import { hasIdentityBinary, verifyDeviceIdentity } from "@/auth/device-fingerprint";
import { CronService } from "@/cron/service";
import { MessageBus } from "@/bus/queue";
import { AgentLoop } from "@/agents/generalist_agent/loop";
import { ChannelManager } from "@/channels/manager";
import { evaluateInboundAllowlistPolicy } from "@/channels/policy";
import { DEFAULT_HEARTBEAT_INTERVAL_S, createHeartbeatRunner } from "@/heartbeat";
import { eventLine, type EventKind } from "@/logging/events";
import { boolFlag, ensureDataDir, makeProviderFromConfig, strFlag, type ParsedArgs } from "@/cli/runtime_helpers";
import { installGatewayLogger } from "@/cli/gateway_logger";
import { MemoryStore } from "@/agents/generalist_agent/memory";
import { startGatewayServer } from "@/gateway/server";
import { isChannelDeliveryTarget, loadAllActiveChannelTargets, loadLastActiveChannelTarget, resolveDeliveryTarget, type DeliveryTarget } from "@/cli/gateway_delivery";
import { authorizeInboundNodeMessage } from "@/auth/cmd/token/runtime-auth";
import { getNodeByToken, hasDeviceToken, listNodes } from "@/auth/cmd/token/shared";

function localDate(tsMs = Date.now()): string {
  const d = new Date(tsMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ensureDailySummaryJob(cron: CronService): void {
  const existing = cron.listJobs(true).find((job) =>
    job.name === "daily_summary_nightly" || job.payload.kind === "daily_summary");
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

export async function gatewayCommandHandler(parsed: ParsedArgs): Promise<number> {
  const { flags, positionals } = parsed;
  ensureDataDir();
  
  const sub = positionals[0];
  if (sub === "discover") {
    const { discoverGateways, formatDiscoveryTable } = await import("@/gateway/discover");
    const timeoutRaw = strFlag(flags, "timeout_ms") ?? strFlag(flags, "timeout");
    const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
    console.log("Discovering Skyth gateways on the local network...");
    const gateways = await discoverGateways({ timeoutMs });
    console.log(formatDiscoveryTable(gateways));
    return 0;
  }

  const cfg = loadConfig();
  const model = strFlag(flags, "model") ?? cfg.agents.defaults.model;
  const routerModel =
    String((cfg.session_graph as Record<string, unknown>)?.router_model ?? "").trim()
    || (cfg.use_router ? String(cfg.router_model ?? "").trim() : "");
  const port = Number(strFlag(flags, "port") ?? "18797");
  const verbose = boolFlag(flags, "verbose", false);
  const printLogs = boolFlag(flags, "print_logs", false);
  const cronStore = join(getDataDir(), "cron", "jobs.json");
  const cron = new CronService(cronStore);
  const cronStatus = cron.status();
  const bus = new MessageBus();
  const memory = new MemoryStore(cfg.workspace_path);
  let lastActiveTarget: DeliveryTarget | undefined = loadLastActiveChannelTarget(cfg.workspace_path);
  const channelTargets = loadAllActiveChannelTargets(cfg.workspace_path);
  const provider = makeProviderFromConfig(model);
  const channels = new ChannelManager(cfg, bus, { webhookPort: port });
  const agent = new AgentLoop({
    bus,
    provider,
    workspace: cfg.workspace_path,
    model,
    temperature: cfg.agents.defaults.temperature,
    max_tokens: cfg.agents.defaults.max_tokens,
    max_iterations: cfg.agents.defaults.max_tool_iterations,
    memory_window: cfg.agents.defaults.memory_window,
    exec_timeout: cfg.tools.exec.timeout,
    restrict_to_workspace: cfg.tools.restrict_to_workspace,
    cron_service: cron,
    router_model: routerModel || undefined,
    enabled_channels: channels.enabledChannels,
    session_graph_config: cfg.session_graph,
  });
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
        const response = await agent.processMessage({
          channel,
          senderId: params.senderId,
          chatId,
          content: params.content,
          metadata: params.metadata,
        }, "heartbeat");
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
    memory.recordEvent({ kind, scope, action, summary, details, session_key: sessionKey });
  };
  let running = true;
  const restoreConsole = installGatewayLogger({ printLogs, verbose });

  try {
    emit("event", "gateway", "start", `port ${String(port)}`, undefined, undefined, false, true);
    emit("event", "gateway", "workspace", cfg.workspace_path, undefined, undefined, false, true);
    emit("event", "gateway", "model", model, undefined, undefined, false, true);
    emit("cron", "gateway", "jobs", String(cronStatus.jobs), undefined, undefined, false, true);
    emit(
      "event",
      "gateway",
      "channels",
      channels.enabledChannels.length ? channels.enabledChannels.join(",") : "none",
      undefined, undefined, false, true,
    );
    if (hasDeviceToken()) {
      const trustedNodes = listNodes().filter((node) => node.mfa_verified);
      emit("event", "gateway", "trust", `${String(trustedNodes.length)} trusted node(s)`, undefined, undefined, false, true);
      for (const channelName of channels.enabledChannels) {
        if (channelName === "email" || channelName === "cli" || channelName === "cron" || channelName === "system") continue;
        const channelTrusted = trustedNodes.filter((node) => node.channel === channelName);
        if (channelTrusted.length) {
          emit(
            "event",
            "gateway",
            "trust",
            `${channelName}: trusted sender(s) ${channelTrusted.map((node) => node.sender_id).join(",")}`,
            undefined,
            undefined,
            false,
            true,
          );
        } else {
          emit("event", "gateway", "trust", `${channelName}: no trusted nodes`, undefined, undefined, true, true);
        }
      }
    } else {
      emit("event", "gateway", "trust", "device token not configured; trust enforcement disabled", undefined, undefined, true, true);
    }
    if (verbose) {
      emit("event", "gateway", "flags", `v=${String(verbose)} p=${String(printLogs)}`, undefined, undefined, false, true);
    }
    if (lastActiveTarget) {
      emit("event", "gateway", "target", `${lastActiveTarget.channel}:${lastActiveTarget.chatId}`, undefined, undefined, false, true);
    }
    if (!channels.enabledChannels.length) {
      emit("event", "gateway", "abort", "no channels", undefined, undefined, true, true);
      return 1;
    }

    if (hasIdentityBinary()) {
      const identity = verifyDeviceIdentity();
      if (!identity.valid) {
        emit("event", "gateway", "abort", `device identity failed: ${identity.reason}`, undefined, undefined, true, true);
        return 1;
      }
      emit("event", "gateway", "identity", "verified", undefined, undefined, false, true);
    }

    ensureDailySummaryJob(cron);
    emit("heartbeat", "gateway", "alive");

    cron.onJob = async (job) => {
      emit("cron", "gateway", "run", String(job.name ?? job.id), { jobId: job.id });
      if (job.payload.kind === "daily_summary") {
        const requestedDate = String(job.payload.message ?? "").trim();
        const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : localDate();
        const summary = memory.writeDailySummary(date);
        emit("cron", "memory", "daily", summary.date, { path: summary.path, events: summary.eventCount });
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
      const response = await agent.processMessage({
        channel: deliverChannel,
        senderId: "cron",
        chatId: deliverTo,
        content: job.payload.message,
        metadata: { source: "cron", cron_job_id: job.id },
      }, `cron:${job.id}`);
      const autoDeliverSystemEvent = job.payload.kind === "system_event";
      const shouldDeliver = Boolean(job.payload.deliver) || autoDeliverSystemEvent;
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
          emit("event", msg.channel, "receive", msg.content, { sender: msg.senderId, chat: msg.chatId });
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
            lastActiveTarget = { channel: normalizedMsg.channel, chatId: normalizedMsg.chatId };
            channelTargets.set(normalizedMsg.channel, {
              channel: normalizedMsg.channel,
              chatId: normalizedMsg.chatId,
              ts: Date.now(),
            });
            agent.updateChannelTargets(channelTargets);
          }

          emit("event", "gateway", "allow", normalizedMsg.channel, undefined, undefined, false, true);
          const response = await agent.processMessage(normalizedMsg);
          if (response) {
            await bus.publishOutbound(response);
            emit("event", response.channel, "send", response.content, { chat: response.chatId });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit("event", "gateway", "error", message, undefined, undefined, undefined, true);
        }
      }
    })();

    const enableWs = !boolFlag(flags, "no_ws", false);
    let gwServer: Awaited<ReturnType<typeof startGatewayServer>> | null = null;
    if (enableWs) {
      const gwHost = cfg.gateway.host;
      const gwPort = cfg.gateway.port;
      const enableDiscovery = !boolFlag(flags, "no_discovery", false);
      const enforceNodeTokens = hasDeviceToken();
      const gwToken = strFlag(flags, "gateway_token") ?? process.env.SKYTH_GATEWAY_TOKEN;
      gwServer = await startGatewayServer({
        host: gwHost,
        port: gwPort,
        bus,
        enableDiscovery,
        validateToken: (token) => {
          if (getNodeByToken(token)) return true;
          if (!enforceNodeTokens && gwToken) return token === gwToken;
          return false;
        },
        log: {
          info: (msg) => emit("event", "ws", "info", msg, undefined, undefined, false, true),
          warn: (msg) => emit("event", "ws", "warn", msg, undefined, undefined, true, true),
        },
      });
      emit("event", "gateway", "ws", `${gwHost}:${gwPort}`, undefined, undefined, false, true);
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
}
