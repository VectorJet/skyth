import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getWorkspacePath } from "../utils/helpers";
import { Config } from "../config/schema";
import { getChannelsDirPath, getConfigPath, loadConfig, saveConfig } from "../config/loader";
import { CronService } from "../cron/service";
import { CronSchedule } from "../cron/types";
import { findByName } from "../providers/registry";

let PROMPT_SESSION: { promptAsync: (prompt: string) => Promise<string> } | null = null;

export function initPromptSession(factory?: () => { promptAsync: (prompt: string) => Promise<string> }): void {
  PROMPT_SESSION = (factory ? factory() : { promptAsync: async () => "" });
}

export async function readInteractiveInputAsync(prompt = "<b>You</b>: "): Promise<string> {
  if (!PROMPT_SESSION) initPromptSession();
  try {
    return await PROMPT_SESSION!.promptAsync(prompt);
  } catch (error) {
    if (error instanceof Error && error.name === "EOFError") {
      throw new Error("KeyboardInterrupt");
    }
    throw error;
  }
}

function ensureWorkspaceTemplates(workspace: string): string[] {
  const created: string[] = [];
  const memoryDir = join(workspace, "memory");
  const skillsDir = join(workspace, "skills");
  mkdirSync(memoryDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });

  const agentsPath = join(workspace, "AGENTS.md");
  const soulPath = join(workspace, "SOUL.md");
  const userPath = join(workspace, "USER.md");
  const memoryPath = join(memoryDir, "MEMORY.md");
  const historyPath = join(memoryDir, "HISTORY.md");

  if (!existsSync(agentsPath)) {
    writeFileSync(
      agentsPath,
      [
        "# Agent Instructions",
        "",
        "You are a helpful AI assistant. Be concise, accurate, and friendly.",
        "",
        "## Guidelines",
        "",
        "- Always explain what you're doing before taking actions",
        "- Ask for clarification when the request is ambiguous",
        "- Use tools to help accomplish tasks",
        "- Remember important information in memory/MEMORY.md; past events are logged in memory/HISTORY.md",
        "",
      ].join("\n"),
      "utf-8",
    );
    created.push("Created AGENTS.md");
  }
  if (!existsSync(soulPath)) {
    writeFileSync(
      soulPath,
      [
        "# Soul",
        "",
        "I am skyth, a lightweight AI assistant.",
        "",
        "## Personality",
        "",
        "- Helpful and friendly",
        "- Concise and to the point",
        "- Curious and eager to learn",
        "",
      ].join("\n"),
      "utf-8",
    );
    created.push("Created SOUL.md");
  }
  if (!existsSync(userPath)) {
    writeFileSync(
      userPath,
      [
        "# User",
        "",
        "Information about the user goes here.",
        "",
        "## Preferences",
        "",
        "- Communication style: (casual/formal)",
        "- Timezone: (your timezone)",
        "- Language: (your preferred language)",
        "",
      ].join("\n"),
      "utf-8",
    );
    created.push("Created USER.md");
  }
  if (!existsSync(memoryPath)) {
    writeFileSync(
      memoryPath,
      [
        "# Long-term Memory",
        "",
        "This file stores important information that should persist across sessions.",
        "",
        "## User Information",
        "",
        "(Important facts about the user)",
        "",
        "## Preferences",
        "",
        "(User preferences learned over time)",
        "",
      ].join("\n"),
      "utf-8",
    );
    created.push("Created memory/MEMORY.md");
  }
  if (!existsSync(historyPath)) {
    writeFileSync(historyPath, "", "utf-8");
    created.push("Created memory/HISTORY.md");
  }

  return created;
}

export function runOnboarding(args: {
  username?: string;
  nickname?: string;
  primary_provider?: string;
  primary_model?: string;
  api_key?: string;
  use_secondary?: boolean;
  use_router?: boolean;
  watcher?: boolean;
  skip_mcp?: boolean;
}, deps?: { workspacePath?: string; configPath?: string }): string {
  const cfg = new Config();
  if (args.username) cfg.username = args.username;
  if (args.nickname) cfg.nickname = args.nickname;
  if (args.primary_provider) cfg.primary_model_provider = args.primary_provider;
  if (args.primary_model) {
    cfg.primary_model = args.primary_model;
    cfg.agents.defaults.model = args.primary_model;
  }

  if (args.api_key && cfg.primary_model_provider && (cfg.providers as any)[cfg.primary_model_provider]) {
    (cfg.providers as any)[cfg.primary_model_provider].api_key = args.api_key;
  }

  cfg.use_secondary_model = Boolean(args.use_secondary);
  cfg.use_router = Boolean(args.use_router);
  cfg.watcher = Boolean(args.watcher);

  saveConfig(cfg, deps?.configPath);

  const workspace = deps?.workspacePath ?? getWorkspacePath();
  const existed = existsSync(workspace);
  mkdirSync(workspace, { recursive: true });
  const created = ensureWorkspaceTemplates(workspace);
  const configPath = deps?.configPath ?? getConfigPath();

  const lines = [
    `Config saved: ${configPath}`,
    ...(existed ? [] : ["Workspace created"]),
    ...created,
    "Onboarding complete.",
    `Configuration saved to: ${configPath}`,
    "",
    "Next steps:",
    "  1. Run: skyth agent -m \"Hello\"",
    "  2. Review: ~/.skyth/config/config.yml and ~/.skyth/auth/api_keys.json",
  ];
  return lines.join("\n");
}

export function initAlias(args: Parameters<typeof runOnboarding>[0], deps?: Parameters<typeof runOnboarding>[1]): string {
  return runOnboarding(args, deps);
}

export function cronAddCommand(args: { name: string; message: string; cron: string; tz?: string }, deps?: { dataDir?: string }): { exitCode: number; output: string } {
  const base = deps?.dataDir ?? join(getWorkspacePath(), "..");
  const service = new CronService(join(base, "cron", "jobs.json"));

  const schedule: CronSchedule = { kind: "cron", expr: args.cron, tz: args.tz };
  try {
    service.addJob({ name: args.name, schedule, message: args.message });
    return { exitCode: 0, output: "Added job" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, output: `Error: ${message}` };
  }
}

export function statusCommand(): string {
  const cfg = loadConfig();
  const configPath = getConfigPath();
  const workspace = cfg.workspace_path;

  const lines = [
    "skyth Status",
    "",
    `Config: ${configPath} ${existsSync(configPath) ? "ok" : "missing"}`,
    `Workspace: ${workspace} ${existsSync(workspace) ? "ok" : "missing"}`,
    `Model: ${cfg.agents.defaults.model}`,
  ];

  for (const provider of Object.keys(cfg.providers)) {
    const p = (cfg.providers as any)[provider];
    const spec = findByName(provider);
    if (spec?.is_oauth) {
      lines.push(`${provider}: OAuth`);
    } else {
      lines.push(`${provider}: ${p?.api_key ? "configured" : "not set"}`);
    }
  }
  return lines.join("\n");
}

export function channelsStatusCommand(): string {
  const cfg = loadConfig();
  const rows: string[] = [];
  const add = (name: string, enabled: boolean, details: string) => {
    rows.push(`${name}\t${enabled ? "enabled" : "disabled"}\t${details}`);
  };

  add("whatsapp", cfg.channels.whatsapp.enabled, cfg.channels.whatsapp.bridge_url || "not configured");
  add("telegram", cfg.channels.telegram.enabled, cfg.channels.telegram.token ? "token configured" : "not configured");
  add("discord", cfg.channels.discord.enabled, cfg.channels.discord.gateway_url || "not configured");
  add("feishu", cfg.channels.feishu.enabled, cfg.channels.feishu.app_id ? "app configured" : "not configured");
  add("mochat", cfg.channels.mochat.enabled, cfg.channels.mochat.base_url || "not configured");
  add("dingtalk", cfg.channels.dingtalk.enabled, cfg.channels.dingtalk.client_id ? "client configured" : "not configured");
  add("email", cfg.channels.email.enabled, cfg.channels.email.imap_host || "not configured");
  add("slack", cfg.channels.slack.enabled, cfg.channels.slack.app_token && cfg.channels.slack.bot_token ? "socket configured" : "not configured");
  add("qq", cfg.channels.qq.enabled, cfg.channels.qq.app_id ? "app configured" : "not configured");
  return ["Channel\tStatus\tConfiguration", ...rows].join("\n");
}

const CHANNEL_NAMES = ["whatsapp", "telegram", "discord", "feishu", "mochat", "dingtalk", "slack", "qq", "email"] as const;
type ChannelName = (typeof CHANNEL_NAMES)[number];

function parseValue(raw: string): any {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

function deepSet(obj: Record<string, any>, path: string, value: any): void {
  const parts = path.split(".").map((v) => v.trim()).filter(Boolean);
  if (!parts.length) return;
  let current: Record<string, any> = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const next = current[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) current[part] = {};
    current = current[part];
  }
  current[parts.at(-1)!] = value;
}

export function channelsEditCommand(args: {
  channel: string;
  enable?: boolean;
  disable?: boolean;
  set?: string;
  json?: string;
}, deps?: { channelsDir?: string }): { exitCode: number; output: string } {
  const channel = args.channel.trim().toLowerCase();
  if (!CHANNEL_NAMES.includes(channel as ChannelName)) {
    return { exitCode: 1, output: `Error: unknown channel '${args.channel}'. Available: ${CHANNEL_NAMES.join(", ")}` };
  }
  if (args.enable && args.disable) {
    return { exitCode: 1, output: "Error: --enable and --disable cannot be used together" };
  }

  const channelsDir = deps?.channelsDir ?? getChannelsDirPath();
  mkdirSync(channelsDir, { recursive: true });
  const path = join(channelsDir, `${channel}.json`);

  const current: Record<string, any> = (() => {
    if (!existsSync(path)) return {};
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  })();

  let changed = false;
  if (args.enable) {
    current.enabled = true;
    changed = true;
  }
  if (args.disable) {
    current.enabled = false;
    changed = true;
  }

  if (args.json) {
    try {
      const patch = JSON.parse(args.json);
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        return { exitCode: 1, output: "Error: --json must be a JSON object" };
      }
      Object.assign(current, patch);
      changed = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { exitCode: 1, output: `Error: invalid --json payload: ${message}` };
    }
  }

  if (args.set) {
    const idx = args.set.indexOf("=");
    if (idx <= 0) {
      return { exitCode: 1, output: "Error: --set must be in key=value form" };
    }
    const key = args.set.slice(0, idx).trim();
    const rawValue = args.set.slice(idx + 1);
    deepSet(current, key, parseValue(rawValue));
    changed = true;
  }

  if (!changed) {
    return { exitCode: 0, output: `Channel config (${channel}): ${path}\n${JSON.stringify(current, null, 2)}` };
  }

  writeFileSync(path, JSON.stringify(current, null, 2), "utf-8");
  return { exitCode: 0, output: `Updated channel config (${channel}): ${path}` };
}
