import { existsSync } from "node:fs";
import { getConfigPath, loadConfig } from "../../../config/loader";
import { findByName } from "../../../providers/registry";
export { channelsStatusCommand } from "./channels";

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
