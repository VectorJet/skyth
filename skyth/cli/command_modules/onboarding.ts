import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getWorkspacePath } from "../../utils/helpers";
import { Config } from "../../config/schema";
import { getConfigPath, saveConfig } from "../../config/loader";

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
