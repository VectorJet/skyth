import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { channelsEditCommand, channelsStatusCommand, configureCommand, cronAddCommand, initAlias, migrateCommand, pairingTelegramCommand, runOnboarding, statusCommand } from "./commands";
import { getDataDir, loadConfig } from "../config/loader";
import { CronService } from "../cron/service";
import { MessageBus } from "../bus/queue";
import { AgentLoop } from "../agents/generalist_agent/loop";
import { ChannelManager } from "../channels/manager";
import { evaluateInboundAllowlistPolicy } from "../channels/policy";
import { listProviderSpecs } from "../providers/registry";
import { DEFAULT_HEARTBEAT_INTERVAL_S, HeartbeatService } from "../heartbeat";
import { eventLine, type EventKind } from "../logging/events";
import { boolFlag, chooseProviderInteractive, ensureDataDir, makeProviderFromConfig, optionalBoolFlag, parseArgs, promptInput, pythonCommand, pythonModuleAvailable, runCommand, saveProviderToken, strFlag, usage } from "./runtime_helpers";
import { CommandRegistry } from "./command_registry";
import { installGatewayLogger } from "./gateway_logger";
import { MemoryStore } from "../agents/generalist_agent/memory";
import { startGatewayServer } from "../gateway/server";
import { discoverGateways, formatDiscoveryTable } from "../gateway/discover";
import { verifySuperuserPassword } from "../auth/superuser";
import { isChannelDeliveryTarget, loadLastActiveChannelTarget, resolveDeliveryTarget, type DeliveryTarget } from "./gateway_delivery";

// Keep CLI output clean unless explicitly overridden by runtime environment.
(globalThis as any).AI_SDK_LOG_WARNINGS = false;

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

async function main(): Promise<number> {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  if (boolFlag(flags, "version") || boolFlag(flags, "v")) {
    console.log("skyth v0.1.0");
    return 0;
  }

  if (positionals.length === 0 || positionals[0] === "help" || boolFlag(flags, "help")) {
    console.log(usage());
    return 0;
  }

  const cmd = positionals[0]!;
  ensureDataDir();

  const registry = new CommandRegistry();
  const onboardingFlag = (key: string): boolean | undefined => optionalBoolFlag(flags, key);
  const installDaemonFlag = onboardingFlag("install_daemon");

  registry.register("run", async () => {
    if (positionals[1] === "onboarding") {
      const output = await runOnboarding({
        username: strFlag(flags, "username"),
        superuser_password: strFlag(flags, "superuser_password"),
        nickname: strFlag(flags, "nickname"),
        primary_provider: strFlag(flags, "primary_provider"),
        primary_model: strFlag(flags, "primary_model"),
        api_key: strFlag(flags, "api_key"),
        use_secondary: onboardingFlag("use_secondary"),
        use_router: onboardingFlag("use_router"),
        watcher: onboardingFlag("watcher"),
        skip_mcp: onboardingFlag("skip_mcp"),
        install_daemon: installDaemonFlag === true ? true : undefined,
        no_install_daemon: installDaemonFlag === false ? true : undefined,
      });
      console.log(output);
      return 0;
    }
    console.error(`Error: unknown run command '${positionals.slice(1).join(" ")}'`);
    return 1;
  });

  registry.register("init", async () => {
    const output = await initAlias({
      username: strFlag(flags, "username"),
      superuser_password: strFlag(flags, "superuser_password"),
      nickname: strFlag(flags, "nickname"),
      primary_provider: strFlag(flags, "primary_provider"),
      primary_model: strFlag(flags, "primary_model"),
      api_key: strFlag(flags, "api_key"),
      use_secondary: onboardingFlag("use_secondary"),
      use_router: onboardingFlag("use_router"),
      watcher: onboardingFlag("watcher"),
      skip_mcp: onboardingFlag("skip_mcp"),
      install_daemon: installDaemonFlag === true ? true : undefined,
      no_install_daemon: installDaemonFlag === false ? true : undefined,
    });
    console.log(output);
    return 0;
  });

  registry.register("onboard", async () => {
    const output = await runOnboarding({
      username: strFlag(flags, "username"),
      superuser_password: strFlag(flags, "superuser_password"),
      nickname: strFlag(flags, "nickname"),
      primary_provider: strFlag(flags, "primary_provider"),
      primary_model: strFlag(flags, "primary_model"),
      api_key: strFlag(flags, "api_key"),
      use_secondary: onboardingFlag("use_secondary"),
      use_router: onboardingFlag("use_router"),
      watcher: onboardingFlag("watcher"),
      skip_mcp: onboardingFlag("skip_mcp"),
      install_daemon: installDaemonFlag === true ? true : undefined,
      no_install_daemon: installDaemonFlag === false ? true : undefined,
    });
    console.log(output);
    return 0;
  });

  registry.register("status", () => {
    console.log(statusCommand());
    return 0;
  });

  registry.register("gateway", async () => {
    const sub = positionals[1];
    if (sub === "discover") {
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
    const provider = makeProviderFromConfig(model);
    const agent = new AgentLoop({
      bus,
      provider,
      workspace: cfg.workspace_path,
      model,
      temperature: cfg.agents.defaults.temperature,
      max_tokens: cfg.agents.defaults.max_tokens,
      max_iterations: cfg.agents.defaults.max_tool_iterations,
      memory_window: cfg.agents.defaults.memory_window,
      brave_api_key: cfg.tools.web.search.api_key,
      exec_timeout: cfg.tools.exec.timeout,
      restrict_to_workspace: cfg.tools.restrict_to_workspace,
      cron_service: cron,
      router_model: routerModel || undefined,
      session_graph_config: cfg.session_graph,
    });
    const channels = new ChannelManager(cfg, bus);
    const heartbeat = new HeartbeatService({
      workspace: cfg.workspace_path,
      interval_s: DEFAULT_HEARTBEAT_INTERVAL_S,
      on_event: (kind, scope, action, summary) => {
        memory.recordEvent({ kind, scope, action, summary });
      },
      on_heartbeat: async (prompt: string) => {
        const target = resolveDeliveryTarget({ fallback: lastActiveTarget });
        const channel = target?.channel ?? "cli";
        const chatId = target?.chatId ?? "heartbeat";
        const response = await agent.processMessage({
          channel,
          senderId: "heartbeat",
          chatId,
          content: prompt,
          metadata: { source: "heartbeat" },
        }, "heartbeat");
        if (response && target) {
          await bus.publishOutbound({
            ...response,
            channel: target.channel,
            chatId: target.chatId,
          });
          emit("heartbeat", "gateway", "send", "delivered");
        }
        return response?.content ?? "";
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
      ensureDailySummaryJob(cron);
      emit("heartbeat", "gateway", "alive");

      cron.onJob = async (job) => {
        emit("cron", "gateway", "run", String(job.name ?? job.id), { jobId: job.id });
        if (job.payload.kind === "daily_summary") {
          const requestedDate = String(job.payload.message ?? "").trim();
          const date = /^\\d{4}-\\d{2}-\\d{2}$/.test(requestedDate) ? requestedDate : localDate();
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
            if (isChannelDeliveryTarget(msg.channel)) {
              lastActiveTarget = { channel: msg.channel, chatId: msg.chatId };
            }
            emit("event", "gateway", "allow", msg.channel, undefined, undefined, false, true);
            const response = await agent.processMessage(msg);
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
        const gwToken = strFlag(flags, "gateway_token") ?? process.env.SKYTH_GATEWAY_TOKEN;
        gwServer = await startGatewayServer({
          host: gwHost,
          port: gwPort,
          bus,
          enableDiscovery,
          validateToken: (token) => {
            if (gwToken) return token === gwToken;
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
      await heartbeat.start();
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
  });

  registry.register("agent", async () => {
    const message = strFlag(flags, "message") ?? strFlag(flags, "m");
    const session = strFlag(flags, "session") ?? strFlag(flags, "s") ?? "cli:direct";

    const cfg = loadConfig();
    const model = strFlag(flags, "model") ?? cfg.agents.defaults.model;
    const routerModel =
      String((cfg.session_graph as Record<string, unknown>)?.router_model ?? "").trim()
      || (cfg.use_router ? String(cfg.router_model ?? "").trim() : "");
    const bus = new MessageBus();
    const provider = makeProviderFromConfig(model);
    const loop = new AgentLoop({
      bus,
      provider,
      workspace: cfg.workspace_path,
      model,
      temperature: cfg.agents.defaults.temperature,
      max_tokens: cfg.agents.defaults.max_tokens,
      max_iterations: cfg.agents.defaults.max_tool_iterations,
      memory_window: cfg.agents.defaults.memory_window,
      brave_api_key: cfg.tools.web.search.api_key,
      exec_timeout: cfg.tools.exec.timeout,
      restrict_to_workspace: cfg.tools.restrict_to_workspace,
      router_model: routerModel || undefined,
      session_graph_config: cfg.session_graph,
    });

    const [channel, chatId] = session.includes(":") ? session.split(":", 2) : ["cli", session];
    if (message) {
      const response = await loop.processMessage({ channel: channel!, senderId: "user", chatId: chatId!, content: message }, session);
      if (response?.content) console.log(response.content);
      return 0;
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    console.log("Interactive mode (type exit or quit to stop)");
    while (true) {
      const input = await new Promise<string>((resolve) => rl.question("You: ", resolve));
      const command = input.trim().toLowerCase();
      if (!command) continue;
      if (command === "exit" || command === "quit" || command === "/exit" || command === "/quit" || command === ":q") break;
      const response = await loop.processMessage({ channel: channel!, senderId: "user", chatId: chatId!, content: input }, session);
      if (response?.content) console.log(`skyth: ${response.content}`);
    }
    rl.close();
    return 0;
  });

  registry.register("channels", async () => {
    const sub = positionals[1];
    if (!sub || sub === "help" || boolFlag(flags, "help")) {
      console.log([
        "Usage: skyth channels COMMAND [ARGS]...",
        "",
        "Commands:",
        "  status",
        "  edit",
        "  login",
      ].join("\n"));
      return 0;
    }
    if (sub === "status") {
      console.log(channelsStatusCommand());
      return 0;
    }
    if (sub === "edit") {
      const channel = positionals[2];
      if (!channel) {
        console.error("Error: channel name is required");
        return 1;
      }
      const result = channelsEditCommand({
        channel,
        enable: boolFlag(flags, "enable", false),
        disable: boolFlag(flags, "disable", false),
        set: strFlag(flags, "set"),
        json: strFlag(flags, "json"),
      });
      console.log(result.output);
      return result.exitCode;
    }
    if (sub === "login") {
      const cfg = loadConfig();
      const bridgeDir = join(process.cwd(), "legacy", "bridge");
      if (!existsSync(join(bridgeDir, "package.json"))) {
        console.error("Error: bridge source not found at legacy/bridge");
        return 1;
      }
      if (!existsSync(join(bridgeDir, "node_modules"))) {
        const installCode = await runCommand("bun", ["install"], bridgeDir);
        if (installCode !== 0) return installCode;
      }
      const env: Record<string, string> = {};
      if (cfg.channels.whatsapp.bridge_token) env.BRIDGE_TOKEN = cfg.channels.whatsapp.bridge_token;
      return await runCommand("bun", ["run", "src/index.ts"], bridgeDir, env);
    }
    console.error(`Error: unknown channels command '${sub}'`);
    return 1;
  });

  registry.register("cron", async () => {
    if (positionals[1] === "add") {
      const name = strFlag(flags, "name");
      const message = strFlag(flags, "message");
      const cron = strFlag(flags, "cron");
      const tz = strFlag(flags, "tz");
      if (!name || !message || !cron) {
        console.error("Error: --name, --message, and --cron are required");
        return 1;
      }
      const result = cronAddCommand({ name, message, cron, tz }, { dataDir: join(getDataDir(), "") });
      console.log(result.output);
      return result.exitCode;
    }

    const sub = positionals[1];
    const store = join(getDataDir(), "cron", "jobs.json");
    const service = new CronService(store);
    if (!sub || sub === "help" || boolFlag(flags, "help")) {
      console.log([
        "Usage: skyth cron COMMAND [ARGS]...",
        "",
        "Commands:",
        "  list",
        "  add",
        "  remove",
        "  enable",
        "  run",
      ].join("\n"));
      return 0;
    }
    if (sub === "list") {
      const all = boolFlag(flags, "all", false);
      const jobs = service.listJobs(all);
      if (!jobs.length) {
        console.log("No scheduled jobs.");
        return 0;
      }
      for (const j of jobs) {
        const sched = j.schedule.kind === "every"
          ? `every ${(j.schedule.every_ms ?? 0) / 1000}s`
          : j.schedule.kind === "cron"
          ? `${j.schedule.expr ?? ""}${j.schedule.tz ? ` (${j.schedule.tz})` : ""}`
          : "one-time";
        const status = j.enabled ? "enabled" : "disabled";
        const next = j.state.next_run_at_ms ? new Date(j.state.next_run_at_ms).toISOString() : "-";
        console.log(`${j.id}\t${j.name}\t${sched}\t${status}\t${next}`);
      }
      return 0;
    }

    if (sub === "remove") {
      const jobId = positionals[2];
      if (!jobId) {
        console.error("Error: job id is required");
        return 1;
      }
      if (service.removeJob(jobId)) {
        console.log(`Removed job ${jobId}`);
        return 0;
      }
      console.error(`Job ${jobId} not found`);
      return 1;
    }

    if (sub === "enable") {
      const jobId = positionals[2];
      if (!jobId) {
        console.error("Error: job id is required");
        return 1;
      }
      const enabled = !boolFlag(flags, "disable", false);
      const job = service.enableJob(jobId, enabled);
      if (!job) {
        console.error(`Job ${jobId} not found`);
        return 1;
      }
      console.log(`${enabled ? "Enabled" : "Disabled"} job ${jobId}`);
      return 0;
    }

    if (sub === "run") {
      const jobId = positionals[2];
      if (!jobId) {
        console.error("Error: job id is required");
        return 1;
      }
      const model = strFlag(flags, "model") ?? loadConfig().agents.defaults.model;
      const provider = makeProviderFromConfig(model);
      const bus = new MessageBus();
      const cfg = loadConfig();
      const routerModel =
        String((cfg.session_graph as Record<string, unknown>)?.router_model ?? "").trim()
        || (cfg.use_router ? String(cfg.router_model ?? "").trim() : "");
      const memory = new MemoryStore(cfg.workspace_path);
      const agent = new AgentLoop({
        bus,
        provider,
        workspace: cfg.workspace_path,
        model,
        temperature: cfg.agents.defaults.temperature,
        max_tokens: cfg.agents.defaults.max_tokens,
        max_iterations: cfg.agents.defaults.max_tool_iterations,
        memory_window: cfg.agents.defaults.memory_window,
        brave_api_key: cfg.tools.web.search.api_key,
        exec_timeout: cfg.tools.exec.timeout,
        restrict_to_workspace: cfg.tools.restrict_to_workspace,
        router_model: routerModel || undefined,
        session_graph_config: cfg.session_graph,
      });
      service.onJob = async (job) => {
        if (job.payload.kind === "daily_summary") {
          const requestedDate = String(job.payload.message ?? "").trim();
          const date = /^\\d{4}-\\d{2}-\\d{2}$/.test(requestedDate) ? requestedDate : localDate();
          const summary = memory.writeDailySummary(date);
          memory.recordEvent({
            kind: "cron",
            scope: "memory",
            action: "daily",
            summary: date,
            details: { path: summary.path, events: summary.eventCount },
          });
          return `daily summary: ${summary.path}`;
        }
        const response = await agent.processMessage({
          channel: job.payload.channel || "cli",
          senderId: "cron",
          chatId: job.payload.to || "cron",
          content: job.payload.message,
          metadata: { source: "cron", cron_job_id: job.id },
        }, `cron:${job.id}`);
        return response?.content;
      };

      const ok = await service.runJob(jobId, true);
      if (ok) {
        console.log(`Ran job ${jobId}`);
        return 0;
      }
      console.error(`Failed to run job ${jobId}`);
      return 1;
    }

    console.error(`Error: unknown cron command '${sub}'`);
    return 1;
  });

  registry.register("pairing", async () => {
    const sub = positionals[1];
    if (!sub || sub === "help" || boolFlag(flags, "help")) {
      console.log([
        "Usage: skyth pairing COMMAND [ARGS]...",
        "",
        "Commands:",
        "  telegram",
        "",
        "Options:",
        "  --reauth         Re-pair a previously configured channel",
        "  --token TOKEN    Provide bot token directly",
        "  --code CODE      Provide a specific pairing code",
        "  --timeout-ms MS  Pairing timeout in milliseconds (default: 120000)",
        "",
        "Requires superuser password if the channel was previously configured.",
        "",
        "Examples:",
        "  skyth pairing telegram",
        "  skyth pairing telegram --reauth",
        "  skyth pairing telegram --code ABC-123",
        "  skyth pairing telegram --timeout-ms 180000",
      ].join("\n"));
      return 0;
    }

    if (sub === "telegram") {
      const timeoutRaw = strFlag(flags, "timeout_ms") ?? strFlag(flags, "timeout");
      const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
      if (timeoutRaw && (!Number.isFinite(timeoutMs) || (timeoutMs ?? 0) <= 0)) {
        console.error("Error: --timeout-ms must be a positive number.");
        return 1;
      }

      const result = await pairingTelegramCommand({
        token: strFlag(flags, "token"),
        code: strFlag(flags, "code"),
        timeout_ms: timeoutMs,
        reauth: boolFlag(flags, "reauth", false),
      }, {
        write: (line) => console.log(line),
      });
      return result.exitCode;
    }

    console.error(`Error: unknown pairing command '${sub}'`);
    return 1;
  });

  registry.register("provider", async () => {
    const sub = positionals[1];
    if (!sub || sub === "help" || boolFlag(flags, "help")) {
      console.log([
        "Usage: skyth provider COMMAND [ARGS]...",
        "",
        "Commands:",
        "  list",
        "  login PROVIDER",
      ].join("\n"));
      return 0;
    }
    if (sub === "list") {
      const specs = await listProviderSpecs({ includeDynamic: true });
      const ids = specs.map((s) => s.name).sort();
      console.log(`Providers (${ids.length})`);
      for (const id of ids) console.log(id);
      return 0;
    }
    if (sub === "login") {
      let provider = positionals[2]?.replaceAll("-", "_");
      const specs = await listProviderSpecs({ includeDynamic: true });
      const providerIDs = specs.map((s) => s.name).sort();
      if (!provider) {
        provider = await chooseProviderInteractive(providerIDs);
        if (!provider) {
          console.error("Error: provider is required");
          return 1;
        }
      }
      if (!providerIDs.includes(provider)) {
        console.error(`Unknown provider: ${provider}`);
        return 1;
      }

      if (provider === "openai_codex" || provider === "openai-codex") {
        if (!pythonModuleAvailable("oauth_cli_kit")) {
          console.error("Error: oauth_cli_kit is not installed in available python environment.");
          console.error("Install with: pip install oauth-cli-kit");
          return 1;
        }
        return await runCommand(pythonCommand(), [
          "-c",
          [
            "from oauth_cli_kit import get_token, login_oauth_interactive",
            "t=None",
            "try:",
            "    t=get_token()",
            "except Exception:",
            "    pass",
            "if not (t and getattr(t,'access',None)):",
            "    t=login_oauth_interactive(print_fn=print,prompt_fn=input)",
            "print('Authenticated with OpenAI Codex' if (t and getattr(t,'access',None)) else 'Authentication failed')",
            "raise SystemExit(0 if (t and getattr(t,'access',None)) else 1)",
          ].join("\n"),
        ]);
      }

      if (provider === "github_copilot" || provider === "github-copilot") {
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
        if (!token) {
          console.error("Error: GitHub Copilot login requires GITHUB_TOKEN or GH_TOKEN in this migration build.");
          return 1;
        }
        const cfg = loadConfig();
        cfg.providers.github_copilot.api_key = token;
        const { saveConfig } = await import("../config/loader");
        saveConfig(cfg);
        console.log("Configured github_copilot provider from environment token.");
        return 0;
      }

      const envToken = process.env[`${provider.toUpperCase()}_API_KEY`] || process.env.API_KEY || process.env.OPENAI_API_KEY || "";
      const key = envToken || (await promptInput(`API key for ${provider}: `));
      if (!key) {
        console.error("Error: API key is required.");
        return 1;
      }
      saveProviderToken(provider, key);
      console.log(`Saved credential for ${provider}.`);
      return 0;
    }

    console.error(`Error: unknown provider command '${sub}'`);
    return 1;
  });

  registry.register("configure", async () => {
    const sub = positionals[1];
    const result = await configureCommand({
      topic: sub,
      value: strFlag(flags, "value") ?? positionals[2],
      provider: strFlag(flags, "provider") ?? positionals[2],
      api_key: strFlag(flags, "api_key"),
      api_base: strFlag(flags, "api_base"),
      model: strFlag(flags, "model") ?? positionals[2],
      primary: boolFlag(flags, "primary", false),
      channel: positionals[2],
      enable: boolFlag(flags, "enable", false) || undefined,
      disable: boolFlag(flags, "disable", false) || undefined,
      set: strFlag(flags, "set"),
      json: strFlag(flags, "json"),
    });
    if (result.output) {
      const sink = result.exitCode === 0 ? console.log : console.error;
      sink(result.output);
    }
    return result.exitCode;
  });

  registry.register("migrate", async () => {
    const result = await migrateCommand({
      direction: positionals[1],
      target: positionals[2],
    });
    const sink = result.exitCode === 0 ? console.log : console.error;
    sink(result.output);
    return result.exitCode;
  });

  if (!registry.has(cmd)) {
    console.error(`Error: unknown command '${positionals.join(" ")}'`);
    console.log(usage());
    return 1;
  }

  return await registry.execute(cmd);
}

const code = await main();
process.exit(code);
