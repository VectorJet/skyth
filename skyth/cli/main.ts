import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { channelsEditCommand, channelsStatusCommand, cronAddCommand, initAlias, runOnboarding, statusCommand } from "./commands";
import { getDataDir, getProviderTokensPath, loadConfig } from "../config/loader";
import { CronService } from "../cron/service";
import { MessageBus } from "../bus/queue";
import { AgentLoop } from "../agents/generalist_agent/loop";
import { AISDKProvider } from "../providers/ai_sdk_provider";
import { ChannelManager } from "../channels/manager";
import { listProviderSpecs, parseModelRef } from "../providers/registry";

// Keep CLI output clean unless explicitly overridden by runtime environment.
(globalThis as any).AI_SDK_LOG_WARNINGS = false;

type ArgMap = Record<string, string | boolean>;

function parseArgs(argv: string[]): { positionals: string[]; flags: ArgMap } {
  const positionals: string[] = [];
  const flags: ArgMap = {};

  let i = 0;
  while (i < argv.length) {
    const token = argv[i]!;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      if (key.startsWith("no-")) {
        flags[key.slice(3).replaceAll("-", "_")] = false;
        i += 1;
        continue;
      }
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key.replaceAll("-", "_")] = next;
        i += 2;
        continue;
      }
      flags[key.replaceAll("-", "_")] = true;
      i += 1;
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      const key = token.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i += 2;
        continue;
      }
      flags[key] = true;
      i += 1;
      continue;
    }
    positionals.push(token);
    i += 1;
  }

  return { positionals, flags };
}

function usage(): string {
  return [
    "Usage: skyth [OPTIONS] COMMAND [ARGS]...",
    "",
    "skyth - Personal AI Assistant",
    "",
    "Options:",
    "  --version, -v",
    "  --install-completion",
    "  --show-completion",
    "  --help",
    "",
    "Commands:",
    "  init       Alias for `skyth run onboarding`.",
    "  gateway    Start the skyth gateway.",
    "  agent      Interact with the agent directly.",
    "  status     Show skyth status.",
    "  run        Run workflows",
    "  channels   Manage channels",
    "  cron       Manage scheduled tasks",
    "  provider   Manage providers",
    "",
    "Run onboarding:",
    "  skyth run onboarding [options]",
    "  skyth init [options]",
    "",
    "Cron add:",
    "  skyth cron add --name NAME --message MSG --cron EXPR [--tz ZONE]",
  ].join("\n");
}

function boolFlag(flags: ArgMap, key: string, fallback = false): boolean {
  const val = flags[key];
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return ["1", "true", "yes", "on"].includes(val.toLowerCase());
  return fallback;
}

function strFlag(flags: ArgMap, key: string): string | undefined {
  const val = flags[key];
  return typeof val === "string" ? val : undefined;
}

function ensureDataDir(): void {
  const dataDir = getDataDir();
  mkdirSync(dataDir, { recursive: true });
}

async function runCommand(command: string, args: string[], cwd?: string, extraEnv?: Record<string, string>): Promise<number> {
  return await new Promise<number>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, ...(extraEnv ?? {}) },
    });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function pythonModuleAvailable(moduleName: string): boolean {
  const python = existsSync(join(process.cwd(), "legacy", ".venv", "bin", "python"))
    ? join(process.cwd(), "legacy", ".venv", "bin", "python")
    : "python3";
  const proc = Bun.spawnSync({
    cmd: [python, "-c", `import ${moduleName}`],
    stdout: "ignore",
    stderr: "ignore",
  });
  return proc.exitCode === 0;
}

function pythonCommand(): string {
  return existsSync(join(process.cwd(), "legacy", ".venv", "bin", "python"))
    ? join(process.cwd(), "legacy", ".venv", "bin", "python")
    : "python3";
}

function makeProviderFromConfig(modelOverride?: string) {
  const cfg = loadConfig();
  const model = modelOverride || cfg.agents.defaults.model;
  const providerName = parseModelRef(model).providerID;
  const p = ((cfg.providers as Record<string, any>)[providerName] as { api_key?: string; api_base?: string } | undefined);
  const token = readProviderTokens()[providerName];
  return new AISDKProvider({
    api_key: p?.api_key || token || undefined,
    api_base: p?.api_base || cfg.getApiBase(model) || undefined,
    default_model: model,
    provider_name: providerName || undefined,
  });
}

function readProviderTokens(): Record<string, string> {
  const path = getProviderTokensPath();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, string>;
  } catch {
    return {};
  }
}

function saveProviderToken(providerID: string, token: string): void {
  const path = getProviderTokensPath();
  mkdirSync(dirname(path), { recursive: true });
  const current = readProviderTokens();
  current[providerID] = token;
  writeFileSync(path, JSON.stringify(current, null, 2), "utf-8");
}

async function promptInput(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = await new Promise<string>((resolve) => rl.question(prompt, resolve));
  rl.close();
  return out.trim();
}

async function chooseProviderInteractive(providerIDs: string[]): Promise<string | undefined> {
  if (!providerIDs.length) return undefined;
  console.log("Add credential");
  console.log("Select provider:");
  providerIDs.slice(0, 80).forEach((id, idx) => {
    console.log(`${String(idx + 1).padStart(2, " ")}. ${id}`);
  });
  const raw = await promptInput("Provider number or id: ");
  if (!raw) return undefined;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= providerIDs.length) return providerIDs[n - 1];
  if (providerIDs.includes(raw.replaceAll("-", "_"))) return raw.replaceAll("-", "_");
  if (providerIDs.includes(raw)) return raw;
  return undefined;
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

  const cmd = positionals[0];
  ensureDataDir();

  if (cmd === "run" && positionals[1] === "onboarding") {
    const output = runOnboarding({
      username: strFlag(flags, "username"),
      nickname: strFlag(flags, "nickname"),
      primary_provider: strFlag(flags, "primary_provider"),
      primary_model: strFlag(flags, "primary_model"),
      api_key: strFlag(flags, "api_key"),
      use_secondary: boolFlag(flags, "use_secondary", false),
      use_router: boolFlag(flags, "use_router", false),
      watcher: boolFlag(flags, "watcher", false),
      skip_mcp: boolFlag(flags, "skip_mcp", false),
    });
    console.log(output);
    return 0;
  }

  if (cmd === "init") {
    const output = initAlias({
      username: strFlag(flags, "username"),
      nickname: strFlag(flags, "nickname"),
      primary_provider: strFlag(flags, "primary_provider"),
      primary_model: strFlag(flags, "primary_model"),
      api_key: strFlag(flags, "api_key"),
      use_secondary: boolFlag(flags, "use_secondary", false),
      use_router: boolFlag(flags, "use_router", false),
      watcher: boolFlag(flags, "watcher", false),
      skip_mcp: boolFlag(flags, "skip_mcp", false),
    });
    console.log(output);
    return 0;
  }

  if (cmd === "status") {
    console.log(statusCommand());
    return 0;
  }

  if (cmd === "gateway") {
    const cfg = loadConfig();
    const model = strFlag(flags, "model") ?? cfg.agents.defaults.model;
    const port = Number(strFlag(flags, "port") ?? "18790");
    const cronStore = join(getDataDir(), "cron", "jobs.json");
    const cron = new CronService(cronStore);
    const cronStatus = cron.status();
    const bus = new MessageBus();
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
    });
    const channels = new ChannelManager(cfg, bus);
    let running = true;

    console.log(`Starting skyth gateway on port ${port}...`);
    console.log(`Workspace: ${cfg.workspace_path}`);
    console.log(`Model: ${model}`);
    console.log(`Cron jobs: ${cronStatus.jobs}`);
    console.log(`Enabled channels: ${channels.enabledChannels.length ? channels.enabledChannels.join(", ") : "none"}`);
    if (!channels.enabledChannels.length) {
      console.error("Gateway aborted: no channels are enabled. Configure at least one channel in ~/.skyth/channels/*.json.");
      return 1;
    }
    console.log("Gateway runtime loop started. Press Ctrl+C to stop.");

    const consumer = (async () => {
      while (running) {
        const msg = await bus.consumeInboundWithTimeout(250);
        if (!msg) continue;
        try {
          console.log(`[gateway] inbound received: ${msg.channel}:${msg.chatId} from ${msg.senderId}`);
          const response = await agent.processMessage(msg);
          if (response) {
            await bus.publishOutbound(response);
            console.log(`[gateway] outbound queued: ${response.channel}:${response.chatId}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[gateway] inbound processing failed: ${message}`);
        }
      }
    })();

    await channels.startAll();

    await new Promise<void>((resolve) => {
      const onSignal = () => resolve();
      process.once("SIGINT", onSignal);
      process.once("SIGTERM", onSignal);
    });
    running = false;
    await consumer;
    await channels.stopAll();
    console.log("Gateway stopped.");
    return 0;
  }

  if (cmd === "agent") {
    const message = strFlag(flags, "message") ?? strFlag(flags, "m");
    const session = strFlag(flags, "session") ?? strFlag(flags, "s") ?? "cli:direct";

    const cfg = loadConfig();
    const model = strFlag(flags, "model") ?? cfg.agents.defaults.model;
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
    });

    const [channel, chatId] = session.includes(":") ? session.split(":", 2) : ["cli", session];
    if (message) {
      const response = await loop.processMessage({
        channel,
        senderId: "user",
        chatId,
        content: message,
      }, session);
      if (response?.content) console.log(response.content);
      return 0;
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    console.log("Interactive mode (type exit or quit to stop)");
    while (true) {
      const input = await new Promise<string>((resolve) => rl.question("You: ", resolve));
      const command = input.trim().toLowerCase();
      if (!command) continue;
      if (command === "exit" || command === "quit" || command === "/exit" || command === "/quit" || command === ":q") {
        break;
      }
      const response = await loop.processMessage({
        channel,
        senderId: "user",
        chatId,
        content: input,
      }, session);
      if (response?.content) console.log(`skyth: ${response.content}`);
    }
    rl.close();
    return 0;
  }

  if (cmd === "channels") {
    const sub = positionals[1];
    if (!sub || sub === "help" || boolFlag(flags, "help")) {
      console.log(
        [
          "Usage: skyth channels COMMAND [ARGS]...",
          "",
          "Commands:",
          "  status",
          "  edit",
          "  login",
        ].join("\n"),
      );
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
      const code = await runCommand("bun", ["run", "src/index.ts"], bridgeDir, env);
      return code;
    }
  }

  if (cmd === "cron" && positionals[1] === "add") {
    const name = strFlag(flags, "name");
    const message = strFlag(flags, "message");
    const cron = strFlag(flags, "cron");
    const tz = strFlag(flags, "tz");

    if (!name || !message || !cron) {
      console.error("Error: --name, --message, and --cron are required");
      return 1;
    }

    const result = cronAddCommand(
      { name, message, cron, tz },
      { dataDir: join(getDataDir(), "") },
    );
    console.log(result.output);
    return result.exitCode;
  }

  if (cmd === "cron") {
    const sub = positionals[1];
    const store = join(getDataDir(), "cron", "jobs.json");
    const service = new CronService(store);
    if (!sub || sub === "help" || boolFlag(flags, "help")) {
      console.log(
        [
          "Usage: skyth cron COMMAND [ARGS]...",
          "",
          "Commands:",
          "  list",
          "  add",
          "  remove",
          "  enable",
          "  run",
        ].join("\n"),
      );
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
        console.log(`${j.id}\t${j.name}\t${sched}\t${j.enabled ? "enabled" : "disabled"}`);
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
      const disable = boolFlag(flags, "disable", false);
      const job = service.enableJob(jobId, !disable);
      if (!job) {
        console.error(`Job ${jobId} not found`);
        return 1;
      }
      console.log(`Job '${job.name}' ${disable ? "disabled" : "enabled"}`);
      return 0;
    }
    if (sub === "run") {
      const jobId = positionals[2];
      if (!jobId) {
        console.error("Error: job id is required");
        return 1;
      }
      const ok = await service.runJob(jobId, boolFlag(flags, "force", false));
      if (ok) {
        console.log("Job executed");
        return 0;
      }
      console.error(`Failed to run job ${jobId}`);
      return 1;
    }
  }

  if (cmd === "provider") {
    const sub = positionals[1];
    if (!sub || sub === "help" || boolFlag(flags, "help")) {
      console.log(
        [
          "Usage: skyth provider COMMAND [ARGS]...",
          "",
          "Commands:",
          "  list",
          "  login PROVIDER",
        ].join("\n"),
      );
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
        const code = await runCommand(pythonCommand(), [
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
        return code;
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

      const envToken =
        process.env[`${provider.toUpperCase()}_API_KEY`] ||
        process.env.API_KEY ||
        process.env.OPENAI_API_KEY ||
        "";
      const key = envToken || (await promptInput(`API key for ${provider}: `));
      if (!key) {
        console.error("Error: API key is required.");
        return 1;
      }
      saveProviderToken(provider, key);
      console.log(`Saved credential for ${provider}.`);
      return 0;
    }
  }

  if (cmd === "run") {
    console.error(`Error: unknown run command '${positionals.slice(1).join(" ")}'`);
    return 1;
  }

  console.error(`Error: unknown command '${positionals.join(" ")}'`);
  console.log(usage());
  return 1;
}

const code = await main();
process.exit(code);
