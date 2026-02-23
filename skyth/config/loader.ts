import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { getDataPath } from "../utils/helpers";
import { Config } from "./schema";

function homePath(): string {
  return process.env.HOME || homedir();
}

export function getConfigPath(): string {
  return join(homePath(), ".skyth", "config", "config.yml");
}

export function getRuntimeConfigPath(): string {
  return join(homePath(), ".skyth", "config", "runtime.json");
}

export function getChannelsDirPath(): string {
  return join(homePath(), ".skyth", "channels");
}

export function getApiKeysPath(): string {
  return join(homePath(), ".skyth", "auth", "api_keys.json");
}

export function getProviderTokensPath(): string {
  return join(homePath(), ".skyth", "auth", "provider_tokens.json");
}

export function getLegacyConfigPath(): string {
  return join(homePath(), ".skyth", "config.json");
}

export function getMcpConfigFile(mcpConfigPath?: string): string {
  const base = (mcpConfigPath ?? "~/.skyth/config/mcp/").replace(/^~\//, `${homePath()}/`);
  return join(base, "mcp_config.json");
}

export function getDataDir(): string {
  return getDataPath();
}

function sanitizeConfigInput(data: any): any {
  const listStringKeys = new Set(["allow_from", "allowFrom", "group_allow_from", "groupAllowFrom", "sessions", "panels"]);
  const walk = (value: any, key?: string): any => {
    if (Array.isArray(value)) {
      const items = value.map((v) => walk(v));
      return key && listStringKeys.has(key) ? items.map(String) : items;
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    }
    return value;
  };
  return walk(data);
}

function migrateConfig(data: any): any {
  const tools = data.tools ?? {};
  const execCfg = tools.exec ?? {};
  if (execCfg.restrictToWorkspace !== undefined && tools.restrictToWorkspace === undefined) {
    tools.restrictToWorkspace = execCfg.restrictToWorkspace;
    delete execCfg.restrictToWorkspace;
  }
  if (tools.mcp_servers && !tools.mcpServers) {
    tools.mcpServers = tools.mcp_servers;
    delete tools.mcp_servers;
  }
  data.tools = tools;
  return data;
}

function normalizePhase1Fields(cfg: Config): Config {
  cfg.normalizePhase1();
  return cfg;
}

const CHANNEL_NAMES = [
  "whatsapp",
  "telegram",
  "discord",
  "feishu",
  "mochat",
  "dingtalk",
  "slack",
  "qq",
  "email",
] as const;

function getChannelConfigPath(name: (typeof CHANNEL_NAMES)[number]): string {
  return join(getChannelsDirPath(), `${name}.json`);
}

function loadChannelsConfig(fallbackChannels?: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...(fallbackChannels ?? {}) };
  let loadedAny = false;
  for (const name of CHANNEL_NAMES) {
    const path = getChannelConfigPath(name);
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      if (data && typeof data === "object" && !Array.isArray(data)) {
        out[name] = data;
        loadedAny = true;
      }
    } catch {
      // ignore malformed channel config and continue with fallback
    }
  }
  return loadedAny ? out : { ...(fallbackChannels ?? {}) };
}

function saveChannelsConfig(channels: Record<string, any> | undefined, overwrite = false): void {
  const dir = getChannelsDirPath();
  mkdirSync(dir, { recursive: true });
  for (const name of CHANNEL_NAMES) {
    const path = getChannelConfigPath(name);
    if (!overwrite && existsSync(path)) continue;
    const payload = channels && typeof channels === "object" ? (channels[name] ?? {}) : {};
    writeFileSync(path, JSON.stringify(payload, null, 2), "utf-8");
  }
}

function loadModularConfig(phase1Path: string): Config {
  const phase1Raw = existsSync(phase1Path) ? (YAML.parse(readFileSync(phase1Path, "utf-8")) ?? {}) : {};
  const runtimePath = getRuntimeConfigPath();
  const apiKeysPath = getApiKeysPath();

  const runtimeRaw = existsSync(runtimePath) ? JSON.parse(readFileSync(runtimePath, "utf-8")) : {};
  const mcpBase = String(phase1Raw.mcp_config_path ?? "~/.skyth/config/mcp/");
  const mcpFile = getMcpConfigFile(mcpBase);
  const mcpRaw = existsSync(mcpFile) ? JSON.parse(readFileSync(mcpFile, "utf-8")) : {};
  const apiRaw = existsSync(apiKeysPath) ? JSON.parse(readFileSync(apiKeysPath, "utf-8")) : {};

  const data: any = {};
  for (const key of ["username", "nickname", "primary_model_provider", "primary_model", "use_secondary_model", "secondary_model_provider", "secondary_model", "use_router", "router_model_provider", "router_model", "watcher", "mcp_config_path"]) {
    if (phase1Raw[key] !== undefined) data[key] = phase1Raw[key];
  }
  for (const key of ["agents", "gateway", "tools"]) {
    if (runtimeRaw[key] !== undefined) data[key] = runtimeRaw[key];
  }
  data.channels = loadChannelsConfig(runtimeRaw.channels);

  const primaryModel = String(data.primary_model ?? "").trim();
  if (primaryModel) {
    data.agents = data.agents ?? {};
    data.agents.defaults = data.agents.defaults ?? {};
    data.agents.defaults.model = primaryModel;
  }

  if (apiRaw && Object.keys(apiRaw).length) data.providers = apiRaw;
  if (mcpRaw && typeof mcpRaw === "object" && mcpRaw.mcpServers && typeof mcpRaw.mcpServers === "object") {
    data.tools = data.tools ?? {};
    data.tools.mcpServers = mcpRaw.mcpServers;
  }

  return Config.from(sanitizeConfigInput(migrateConfig(data)));
}

export function loadConfig(configPath?: string): Config {
  const phase1Path = configPath ?? getConfigPath();
  if (existsSync(phase1Path) || existsSync(getRuntimeConfigPath())) {
    try {
      return normalizePhase1Fields(loadModularConfig(phase1Path));
    } catch {
      return normalizePhase1Fields(new Config());
    }
  }

  const legacyPath = getLegacyConfigPath();
  if (existsSync(legacyPath)) {
    try {
      const data = JSON.parse(readFileSync(legacyPath, "utf-8"));
      const cfg = normalizePhase1Fields(Config.from(sanitizeConfigInput(migrateConfig(data))));
      try {
        saveConfig(cfg, phase1Path);
      } catch {
        // ignore migration save failures
      }
      return cfg;
    } catch {
      return normalizePhase1Fields(new Config());
    }
  }

  return normalizePhase1Fields(new Config());
}

export function saveConfig(config: Config, configPath?: string): void {
  const cfg = normalizePhase1Fields(config);
  const phase1Path = configPath ?? getConfigPath();
  const runtimePath = getRuntimeConfigPath();
  const apiKeysPath = getApiKeysPath();
  const mcpPath = getMcpConfigFile(cfg.mcp_config_path);

  mkdirSync(phase1Path.split("/").slice(0, -1).join("/"), { recursive: true });
  mkdirSync(runtimePath.split("/").slice(0, -1).join("/"), { recursive: true });
  mkdirSync(apiKeysPath.split("/").slice(0, -1).join("/"), { recursive: true });
  mkdirSync(mcpPath.split("/").slice(0, -1).join("/"), { recursive: true });
  mkdirSync(getChannelsDirPath(), { recursive: true });

  const phase1Payload = {
    username: cfg.username,
    nickname: cfg.nickname,
    primary_model_provider: cfg.primary_model_provider,
    primary_model: cfg.primary_model,
    use_secondary_model: cfg.use_secondary_model,
    secondary_model_provider: cfg.secondary_model_provider,
    secondary_model: cfg.secondary_model,
    use_router: cfg.use_router,
    router_model_provider: cfg.router_model_provider,
    router_model: cfg.router_model,
    watcher: cfg.watcher,
    mcp_config_path: cfg.mcp_config_path,
  };

  const runtimePayload: any = {
    agents: cfg.agents,
    gateway: cfg.gateway,
    tools: { ...cfg.tools },
  };
  delete runtimePayload.tools.mcp_servers;

  const providerPayload = cfg.providers;
  const mcpPayload = {
    mcpServers: Object.fromEntries(Object.entries(cfg.tools.mcp_servers).map(([name, server]: any) => [name, { ...server }])),
  };

  writeFileSync(phase1Path, YAML.stringify(phase1Payload), "utf-8");
  writeFileSync(runtimePath, JSON.stringify(runtimePayload, null, 2), "utf-8");
  writeFileSync(apiKeysPath, JSON.stringify(providerPayload, null, 2), "utf-8");
  writeFileSync(mcpPath, JSON.stringify(mcpPayload, null, 2), "utf-8");
  // Keep channels in dedicated files and do not overwrite existing channel configs.
  saveChannelsConfig(cfg.channels, false);
}
