import { loadConfig } from "../../../config/loader";

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
