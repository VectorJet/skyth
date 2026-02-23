import { existsSync } from "node:fs";
import { getConfigPath, loadConfig } from "../../config/loader";
import { findByName } from "../../providers/registry";

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
