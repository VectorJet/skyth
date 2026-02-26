import { join } from "node:path";
import { homedir } from "node:os";
import { findByModel, findByName } from "../providers/registry";

export interface ProviderConfig {
  api_key: string;
  api_base?: string;
  extra_headers?: Record<string, string>;
}

export interface MCPServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
  tool_timeout: number;
}

export interface WebSearchProviderConfig {
  api_key?: string;
  api_base?: string;
  model?: string;
  extra_headers?: Record<string, string>;
}

export interface EmailConfig {
  enabled: boolean;
  consent_granted: boolean;
  imap_host: string;
  imap_port: number;
  imap_username: string;
  imap_password: string;
  imap_mailbox: string;
  imap_use_ssl: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_use_tls: boolean;
  smtp_use_ssl: boolean;
  from_address: string;
  auto_reply_enabled: boolean;
  poll_interval_seconds: number;
  mark_seen: boolean;
  max_body_chars: number;
  subject_prefix: string;
  allow_from: string[];
}

function providerDefaults(): ProviderConfig {
  return { api_key: "" };
}

interface BasicTokenChannel {
  enabled: boolean;
  allow_from: string[];
}

export class Config {
  username = (process.env.USER || process.env.USERNAME || "owner").trim() || "owner";
  nickname = "assistant";
  primary_model_provider = "";
  primary_model = "";
  use_secondary_model = false;
  secondary_model_provider = "";
  secondary_model = "";
  use_router = false;
  router_model_provider = "";
  router_model = "";
  watcher = false;
  mcp_config_path = "~/.skyth/config/mcp/";

  agents = { defaults: { workspace: join(homedir(), ".skyth", "workspace"), model: "anthropic/claude-opus-4-5", max_tokens: 8192, temperature: 0.7, max_tool_iterations: 200, memory_window: 50 } };
  channels = {
    whatsapp: { enabled: false, bridge_url: "ws://localhost:3001", bridge_token: "", allow_from: [] as string[] },
    telegram: { enabled: false, token: "", allow_from: [] as string[] },
    discord: {
      enabled: false,
      token: "",
      allow_from: [] as string[],
      gateway_url: "wss://gateway.discord.gg/?v=10&encoding=json",
      intents: 37377,
    },
    feishu: { enabled: false, app_id: "", app_secret: "", encrypt_key: "", verification_token: "", allow_from: [] as string[] },
    mochat: {
      enabled: false,
      base_url: "https://mochat.io",
      socket_url: "",
      socket_path: "/socket.io",
      socket_disable_msgpack: false,
      socket_reconnect_delay_ms: 1000,
      socket_max_reconnect_delay_ms: 10000,
      socket_connect_timeout_ms: 10000,
      refresh_interval_ms: 30000,
      watch_timeout_ms: 25000,
      watch_limit: 100,
      retry_delay_ms: 500,
      max_retry_attempts: 0,
      claw_token: "",
      agent_user_id: "",
      sessions: [] as string[],
      panels: [] as string[],
      allow_from: [] as string[],
      mention: { require_in_groups: false },
      groups: {} as Record<string, { require_mention: boolean }>,
      reply_delay_mode: "non-mention",
      reply_delay_ms: 120000,
    },
    dingtalk: { enabled: false, client_id: "", client_secret: "", allow_from: [] as string[] },
    slack: {
      enabled: false,
      mode: "socket",
      webhook_path: "/slack/events",
      bot_token: "",
      app_token: "",
      user_token_read_only: true,
      reply_in_thread: true,
      react_emoji: "eyes",
      group_policy: "mention",
      group_allow_from: [] as string[],
      dm: { enabled: true, policy: "open", allow_from: [] as string[] },
    },
    qq: { enabled: false, app_id: "", secret: "", allow_from: [] as string[] },
    email: {
      enabled: false,
      consent_granted: false,
      imap_host: "",
      imap_port: 993,
      imap_username: "",
      imap_password: "",
      imap_mailbox: "INBOX",
      imap_use_ssl: true,
      smtp_host: "",
      smtp_port: 587,
      smtp_username: "",
      smtp_password: "",
      smtp_use_tls: true,
      smtp_use_ssl: false,
      from_address: "",
      auto_reply_enabled: true,
      poll_interval_seconds: 30,
      mark_seen: true,
      max_body_chars: 12000,
      subject_prefix: "Re: ",
      allow_from: [] as string[],
    } as EmailConfig,
  };
  providers = {
    custom: providerDefaults(),
    anthropic: providerDefaults(),
    openai: providerDefaults(),
    openrouter: providerDefaults(),
    deepseek: providerDefaults(),
    openai_codex: providerDefaults(),
    github_copilot: providerDefaults(),
  };
  gateway = { host: "0.0.0.0", port: 18790, discovery: { enabled: true, mdns_mode: "minimal" as "off" | "minimal" | "full" } };
  websearch = {
    enabled: true,
    max_results: 8,
    providers: {} as Record<string, WebSearchProviderConfig>,
  };

  tools = {
    web: { search: { api_key: "", max_results: 5 } },
    exec: { timeout: 60 },
    restrict_to_workspace: false,
    mcp_servers: {} as Record<string, MCPServerConfig>,
  };
  session_graph = {
    auto_merge_on_switch: true,
    persist_to_disk: true,
    max_switch_history: 20,
    model_context_window: 200000,
    router_model: "",
    router_cache_ttl_ms: 600000,
    router_cache_max_entries: 256,
    router_max_source_messages: 3,
    router_max_target_messages: 2,
    router_snippet_chars: 180,
    sticky_merge_switches: 3,
    sticky_merge_ttl_ms: 1800000,
    sticky_merge_confidence: 0.75,
  };

  static from(data: Record<string, any>): Config {
    const cfg = new Config();
    const normalizedData = normalizeLegacyKeys(data ?? {});
    for (const key of [
      "username",
      "nickname",
      "primary_model_provider",
      "primary_model",
      "use_secondary_model",
      "secondary_model_provider",
      "secondary_model",
      "use_router",
      "router_model_provider",
      "router_model",
      "watcher",
      "mcp_config_path",
    ]) {
      if (normalizedData[key] !== undefined) (cfg as any)[key] = normalizedData[key];
    }

    cfg.agents = {
      ...cfg.agents,
      ...(normalizedData.agents ?? {}),
      defaults: {
        ...cfg.agents.defaults,
        ...(normalizedData.agents?.defaults ?? {}),
      },
    };

    const dataChannels = normalizedData.channels ?? {};
    cfg.channels = {
      ...cfg.channels,
      ...dataChannels,
      whatsapp: { ...cfg.channels.whatsapp, ...(dataChannels.whatsapp ?? {}) },
      telegram: { ...cfg.channels.telegram, ...(dataChannels.telegram ?? {}) },
      discord: { ...cfg.channels.discord, ...(dataChannels.discord ?? {}) },
      feishu: { ...cfg.channels.feishu, ...(dataChannels.feishu ?? {}) },
      mochat: {
        ...cfg.channels.mochat,
        ...(dataChannels.mochat ?? {}),
        mention: { ...cfg.channels.mochat.mention, ...(dataChannels.mochat?.mention ?? {}) },
        groups: { ...cfg.channels.mochat.groups, ...(dataChannels.mochat?.groups ?? {}) },
      },
      dingtalk: { ...cfg.channels.dingtalk, ...(dataChannels.dingtalk ?? {}) },
      slack: {
        ...cfg.channels.slack,
        ...(dataChannels.slack ?? {}),
        dm: { ...cfg.channels.slack.dm, ...(dataChannels.slack?.dm ?? {}) },
      },
      qq: { ...cfg.channels.qq, ...(dataChannels.qq ?? {}) },
      email: { ...cfg.channels.email, ...(dataChannels.email ?? {}) },
    };

    const dataProviders = normalizedData.providers ?? {};
    cfg.providers = {
      ...cfg.providers,
      ...Object.fromEntries(Object.entries(dataProviders).map(([k, v]) => [k, { ...providerDefaults(), ...(v as any) }])),
    };

    cfg.tools = {
      ...cfg.tools,
      ...(normalizedData.tools ?? {}),
      web: { ...cfg.tools.web, ...(normalizedData.tools?.web ?? {}), search: { ...cfg.tools.web.search, ...(normalizedData.tools?.web?.search ?? {}) } },
      exec: { ...cfg.tools.exec, ...(normalizedData.tools?.exec ?? {}) },
      mcp_servers: { ...(normalizedData.tools?.mcpServers ?? normalizedData.tools?.mcp_servers ?? cfg.tools.mcp_servers) },
    };

    const dataWebsearch = normalizedData.websearch ?? {};
    cfg.websearch = {
      ...cfg.websearch,
      ...dataWebsearch,
      providers: {
        ...cfg.websearch.providers,
        ...Object.fromEntries(
          Object.entries(dataWebsearch.providers ?? {}).map(([k, v]) => [k, { ...{ api_key: "", api_base: "", model: "", extra_headers: {} }, ...(v as any) }]),
        ),
      },
    };

    cfg.session_graph = {
      ...cfg.session_graph,
      ...(normalizedData.session_graph ?? {}),
    };

    cfg.normalizePhase1();
    return cfg;
  }

  get workspace_path(): string {
    return this.agents.defaults.workspace.replace(/^~\//, `${homedir()}/`);
  }

  private matchProvider(model?: string): [ProviderConfig | undefined, string | undefined] {
    const currentModel = (model ?? this.agents.defaults.model).toLowerCase();
    const normalized = currentModel.replaceAll("-", "_");
    const prefix = currentModel.includes("/") ? currentModel.split("/", 1)[0] : "";
    const normalizedPrefix = prefix.replaceAll("-", "_");

    for (const name of Object.keys(this.providers)) {
      const provider = (this.providers as any)[name] as ProviderConfig;
      if (prefix && normalizedPrefix === name && provider && (provider.api_key || name === "openai_codex" || name === "github_copilot")) {
        return [provider, name];
      }
    }

    const match = findByModel(currentModel);
    if (match) {
      const provider = (this.providers as any)[match.name] as ProviderConfig | undefined;
      if (provider && (provider.api_key || match.is_oauth)) return [provider, match.name];
    }

    for (const name of Object.keys(this.providers)) {
      const provider = (this.providers as any)[name] as ProviderConfig;
      if (provider?.api_key) return [provider, name];
    }
    return [undefined, undefined];
  }

  getProvider(model?: string): ProviderConfig | undefined {
    return this.matchProvider(model)[0];
  }

  getProviderName(model?: string): string | undefined {
    return this.matchProvider(model)[1];
  }

  getApiKey(model?: string): string | undefined {
    return this.getProvider(model)?.api_key;
  }

  getApiBase(model?: string): string | undefined {
    const [provider, name] = this.matchProvider(model);
    if (provider?.api_base) return provider.api_base;
    if (name) {
      const spec = findByName(name);
      if (spec?.is_gateway && spec.default_api_base) return spec.default_api_base;
    }
    return undefined;
  }

  normalizePhase1(): void {
    if (!this.primary_model) this.primary_model = this.agents.defaults.model;
    else this.agents.defaults.model = this.primary_model;

    if (!this.primary_model_provider) {
      this.primary_model_provider = this.getProviderName(this.primary_model) || (this.primary_model.includes("/") ? this.primary_model.split("/", 1)[0] : "");
    }
    if (!this.mcp_config_path) this.mcp_config_path = "~/.skyth/config/mcp/";
  }
}

function normalizeLegacyKeys(data: Record<string, any>): Record<string, any> {
  const out = structuredClone(data);
  const channels = out.channels ?? {};
  if (channels.whatsapp?.allowFrom && !channels.whatsapp.allow_from) {
    channels.whatsapp.allow_from = channels.whatsapp.allowFrom;
  }
  if (channels.telegram?.allowFrom && !channels.telegram.allow_from) {
    channels.telegram.allow_from = channels.telegram.allowFrom;
  }
  if (channels.discord?.allowFrom && !channels.discord.allow_from) {
    channels.discord.allow_from = channels.discord.allowFrom;
  }
  if (channels.feishu?.allowFrom && !channels.feishu.allow_from) {
    channels.feishu.allow_from = channels.feishu.allowFrom;
  }
  if (channels.dingtalk?.allowFrom && !channels.dingtalk.allow_from) {
    channels.dingtalk.allow_from = channels.dingtalk.allowFrom;
  }
  if (channels.slack?.groupAllowFrom && !channels.slack.group_allow_from) {
    channels.slack.group_allow_from = channels.slack.groupAllowFrom;
  }
  if (channels.slack?.dm?.allowFrom && !channels.slack.dm.allow_from) {
    channels.slack.dm.allow_from = channels.slack.dm.allowFrom;
  }
  if (channels.qq?.allowFrom && !channels.qq.allow_from) {
    channels.qq.allow_from = channels.qq.allowFrom;
  }
  if (channels.email?.allowFrom && !channels.email.allow_from) {
    channels.email.allow_from = channels.email.allowFrom;
  }
  out.channels = channels;

  const providers = out.providers ?? {};
  for (const [key, value] of Object.entries(providers)) {
    if (value && typeof value === "object" && (value as any).apiKey && !(value as any).api_key) {
      (value as any).api_key = (value as any).apiKey;
    }
    providers[key] = value;
  }
  out.providers = providers;

  const tools = out.tools ?? {};
  if (tools.mcpServers && !tools.mcp_servers) tools.mcp_servers = tools.mcpServers;
  if (tools.mcp_servers && typeof tools.mcp_servers === "object") {
    for (const value of Object.values(tools.mcp_servers as Record<string, any>)) {
      if (value && typeof value === "object" && value.toolTimeout !== undefined && value.tool_timeout === undefined) {
        value.tool_timeout = value.toolTimeout;
      }
    }
  }
  out.tools = tools;
  return out;
}
