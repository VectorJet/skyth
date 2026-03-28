import { join } from "node:path";
import { homedir } from "node:os";
import { findByModel, findByName } from "@/providers/registry";
import { normalizeLegacyKeys, providerDefaults } from "@/config/schema_helpers";

import type { ProviderConfig, MCPServerConfig, WebSearchProviderConfig, EmailConfig } from "./interfaces";
import {
	getDefaultAgentsConfig,
	getDefaultEmailConfig,
	DEFAULT_SESSION_GRAPH,
	DEFAULT_GATEWAY_HOST,
	DEFAULT_GATEWAY_PORT,
	DEFAULT_MDNS_MODE,
	DEFAULT_WEBSEARCH_MAX_RESULTS,
	DEFAULT_EXEC_TIMEOUT,
} from "./defaults";

export class Config {
	username =
		(process.env.USER || process.env.USERNAME || "owner").trim() || "owner";
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

	agents = {
		defaults: getDefaultAgentsConfig(),
	};

	channels = {
		web: { enabled: true, allow_from: [] as string[] },
		whatsapp: {
			enabled: false,
			bridge_url: "ws://localhost:3001",
			bridge_token: "",
			allow_from: [] as string[],
			group_policy: "mention" as "open" | "allowlist" | "mention",
			group_allow_from: [] as string[],
		},
		telegram: {
			enabled: false,
			token: "",
			allow_from: [] as string[],
			dm: {
				enabled: true,
				policy: "open" as "open" | "allowlist",
				allow_from: [] as string[],
			},
			group_policy: "mention" as "open" | "allowlist" | "mention",
			group_allow_from: [] as string[],
		},
		discord: {
			enabled: false,
			token: "",
			allow_from: [] as string[],
			gateway_url: "wss://gateway.discord.gg/?v=10&encoding=json",
			intents: 37377,
			dm: {
				enabled: true,
				policy: "open" as "open" | "allowlist",
				allow_from: [] as string[],
			},
			group_policy: "allowlist" as "open" | "allowlist" | "mention",
			group_allow_from: [] as string[],
		},
		feishu: {
			enabled: false,
			app_id: "",
			app_secret: "",
			encrypt_key: "",
			verification_token: "",
			allow_from: [] as string[],
		},
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
		dingtalk: {
			enabled: false,
			client_id: "",
			client_secret: "",
			allow_from: [] as string[],
		},
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
		email: getDefaultEmailConfig() as EmailConfig,
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

	gateway = {
		host: DEFAULT_GATEWAY_HOST,
		port: DEFAULT_GATEWAY_PORT,
		discovery: {
			enabled: true,
			mdns_mode: DEFAULT_MDNS_MODE,
		},
	};

	websearch = {
		enabled: true,
		max_results: DEFAULT_WEBSEARCH_MAX_RESULTS,
		providers: {} as Record<string, WebSearchProviderConfig>,
	};

	tools = {
		web: { search: { api_key: "", max_results: 5 } },
		exec: {
			timeout: DEFAULT_EXEC_TIMEOUT,
			allowlist: [] as string[],
			deny: [] as string[],
		},
		restrict_to_workspace: false,
		mcp_servers: {} as Record<string, MCPServerConfig>,
	};

	session_graph = { ...DEFAULT_SESSION_GRAPH };

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
			if (normalizedData[key] !== undefined)
				(cfg as any)[key] = normalizedData[key];
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
			web: { ...cfg.channels.web, ...(dataChannels.web ?? {}) },
			whatsapp: { ...cfg.channels.whatsapp, ...(dataChannels.whatsapp ?? {}) },
			telegram: { ...cfg.channels.telegram, ...(dataChannels.telegram ?? {}) },
			discord: { ...cfg.channels.discord, ...(dataChannels.discord ?? {}) },
			feishu: { ...cfg.channels.feishu, ...(dataChannels.feishu ?? {}) },
			mochat: {
				...cfg.channels.mochat,
				...(dataChannels.mochat ?? {}),
				mention: {
					...cfg.channels.mochat.mention,
					...(dataChannels.mochat?.mention ?? {}),
				},
				groups: {
					...cfg.channels.mochat.groups,
					...(dataChannels.mochat?.groups ?? {}),
				},
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
			...Object.fromEntries(
				Object.entries(dataProviders).map(([k, v]) => [
					k,
					{ ...providerDefaults(), ...(v as any) },
				]),
			),
		};

		cfg.tools = {
			...cfg.tools,
			...(normalizedData.tools ?? {}),
			web: {
				...cfg.tools.web,
				...(normalizedData.tools?.web ?? {}),
				search: {
					...cfg.tools.web.search,
					...(normalizedData.tools?.web?.search ?? {}),
				},
			},
			exec: { ...cfg.tools.exec, ...(normalizedData.tools?.exec ?? {}) },
			mcp_servers: {
				...(normalizedData.tools?.mcpServers ??
					normalizedData.tools?.mcp_servers ??
					cfg.tools.mcp_servers),
			},
		};

		const dataWebsearch = normalizedData.websearch ?? {};
		cfg.websearch = {
			...cfg.websearch,
			...dataWebsearch,
			providers: {
				...cfg.websearch.providers,
				...Object.fromEntries(
					Object.entries(dataWebsearch.providers ?? {}).map(([k, v]) => [
						k,
						{
							...{ api_key: "", api_base: "", model: "", extra_headers: {} },
							...(v as any),
						},
					]),
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

	private matchProvider(
		model?: string,
	): [ProviderConfig | undefined, string | undefined] {
		const currentModel = (model ?? this.agents.defaults.model).toLowerCase();
		const normalized = currentModel.replaceAll("-", "_");
		const prefix = currentModel.includes("/")
			? (currentModel.split("/", 1)[0] ?? "")
			: "";
		const normalizedPrefix = prefix.replaceAll("-", "_");

		for (const name of Object.keys(this.providers)) {
			const provider = (this.providers as any)[name] as ProviderConfig;
			if (
				prefix &&
				normalizedPrefix === name &&
				provider &&
				(provider.api_key ||
					name === "openai_codex" ||
					name === "github_copilot")
			) {
				return [provider, name];
			}
		}

		const match = findByModel(currentModel);
		if (match) {
			const provider = (this.providers as any)[match.name] as
				| ProviderConfig
				| undefined;
			if (provider && (provider.api_key || match.is_oauth))
				return [provider, match.name];
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
			if (spec?.is_gateway && spec.default_api_base)
				return spec.default_api_base;
		}
		return undefined;
	}

	normalizePhase1(): void {
		if (!this.primary_model) this.primary_model = this.agents.defaults.model;
		else this.agents.defaults.model = this.primary_model;

		if (!this.primary_model_provider) {
			const providerName = this.getProviderName(this.primary_model);
			const fallbackProvider = this.primary_model.includes("/")
				? (this.primary_model.split("/", 1)[0] ?? "")
				: "";
			this.primary_model_provider = providerName ?? fallbackProvider;
		}
		if (!this.mcp_config_path) this.mcp_config_path = "~/.skyth/config/mcp/";
	}
}

export type { ProviderConfig, MCPServerConfig, WebSearchProviderConfig, EmailConfig };