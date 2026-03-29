import type { GatewayClient } from "@/gateway/protocol";
import { loadConfig, saveConfig } from "@/config/loader";

export interface ConfigHandlerDeps {
	getAuthenticatedNode: (client: GatewayClient) => {
		node_id: string;
		channel: string;
		sender_id: string;
	} | null;
}

export interface ConfigSnapshotResult {
	username: string;
	nickname: string;
	primary_model_provider: string;
	primary_model: string;
	use_secondary_model: boolean;
	secondary_model_provider: string;
	secondary_model: string;
	use_router: boolean;
	router_model_provider: string;
	router_model: string;
	watcher: boolean;
	mcp_config_path: string;
	agents: Record<string, unknown>;
	gateway: Record<string, unknown>;
	tools: Record<string, unknown>;
	websearch: Record<string, unknown>;
	channels: Record<string, unknown>;
	providers: Record<string, unknown>;
	session_graph: Record<string, unknown>;
}

export interface ConfigSchemaResult {
	schema: Record<string, unknown>;
}

export interface ConfigApplyResult {
	ok: boolean;
	errors?: string[];
}

export interface ConfigValidateResult {
	valid: boolean;
	errors?: string[];
}

// Get config schema for UI
function getConfigSchema(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			username: { type: "string" },
			nickname: { type: "string" },
			primary_model_provider: { type: "string" },
			primary_model: { type: "string" },
			use_secondary_model: { type: "boolean" },
			secondary_model_provider: { type: "string" },
			secondary_model: { type: "string" },
			use_router: { type: "boolean" },
			router_model_provider: { type: "string" },
			router_model: { type: "string" },
			watcher: { type: "boolean" },
			mcp_config_path: { type: "string" },
		},
		additionalProperties: true,
	};
}

// Validate config values
function validateConfigValue(key: string, value: unknown): string[] {
	const errors: string[] = [];

	switch (key) {
		case "primary_model_provider":
		case "secondary_model_provider":
		case "router_model_provider":
			if (typeof value !== "string") {
				errors.push(`${key} must be a string`);
			}
			break;
		case "primary_model":
		case "secondary_model":
		case "router_model":
			if (typeof value !== "string") {
				errors.push(`${key} must be a string`);
			}
			break;
		case "use_router":
		case "use_secondary_model":
		case "watcher":
			if (typeof value !== "boolean") {
				errors.push(`${key} must be a boolean`);
			}
			break;
		case "username":
		case "nickname":
			if (typeof value !== "string") {
				errors.push(`${key} must be a string`);
			}
			break;
		case "mcp_config_path":
			if (typeof value !== "string") {
				errors.push(`${key} must be a string`);
			}
			break;
	}

	return errors;
}

export function createConfigHandlers(deps: ConfigHandlerDeps) {
	const { getAuthenticatedNode } = deps;

	return {
		"config.snapshot": async (
			_method: string,
			_params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const cfg = loadConfig();

			// Return config snapshot (secrets are redacted)
			return {
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
				agents: cfg.agents,
				gateway: cfg.gateway,
				tools: cfg.tools,
				websearch: cfg.websearch,
				channels: cfg.channels,
				providers: cfg.providers,
				session_graph: cfg.session_graph,
			} as ConfigSnapshotResult;
		},

		"config.schema": async (
			_method: string,
			_params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			return {
				schema: getConfigSchema(),
			} as ConfigSchemaResult;
		},

		"config.apply": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const node = getAuthenticatedNode(_client);
			if (!node) {
				throw new Error("authentication required");
			}

			const p = params as Record<string, unknown> | undefined;
			if (!p || typeof p !== "object") {
				throw new Error("config apply requires an object parameter");
			}

			const cfg = loadConfig();
			const errors: string[] = [];

			// Apply each valid config value
			for (const [key, value] of Object.entries(p)) {
				const validationErrors = validateConfigValue(key, value);
				if (validationErrors.length > 0) {
					errors.push(...validationErrors);
					continue;
				}

				// Apply the value to config
				switch (key) {
					case "username":
						cfg.username = String(value);
						break;
					case "nickname":
						cfg.nickname = String(value);
						break;
					case "primary_model_provider":
						cfg.primary_model_provider = String(value);
						break;
					case "primary_model":
						cfg.primary_model = String(value);
						break;
					case "use_secondary_model":
						cfg.use_secondary_model = Boolean(value);
						break;
					case "secondary_model_provider":
						cfg.secondary_model_provider = String(value);
						break;
					case "secondary_model":
						cfg.secondary_model = String(value);
						break;
					case "use_router":
						cfg.use_router = Boolean(value);
						break;
					case "router_model_provider":
						cfg.router_model_provider = String(value);
						break;
					case "router_model":
						cfg.router_model = String(value);
						break;
					case "watcher":
						cfg.watcher = Boolean(value);
						break;
					case "mcp_config_path":
						cfg.mcp_config_path = String(value);
						break;
					case "agents":
						if (typeof value === "object") {
							cfg.agents = {
								...cfg.agents,
								...(value as Record<string, unknown>),
							};
						}
						break;
					case "gateway":
						if (typeof value === "object") {
							cfg.gateway = {
								...cfg.gateway,
								...(value as Record<string, unknown>),
							};
						}
						break;
					case "tools":
						if (typeof value === "object") {
							cfg.tools = {
								...cfg.tools,
								...(value as Record<string, unknown>),
							};
						}
						break;
					case "websearch":
						if (typeof value === "object") {
							cfg.websearch = {
								...cfg.websearch,
								...(value as Record<string, unknown>),
							};
						}
						break;
					case "session_graph":
						if (typeof value === "object") {
							cfg.session_graph = {
								...cfg.session_graph,
								...(value as Record<string, unknown>),
							};
						}
						break;
					// Note: channels and providers are handled separately for security
				}
			}

			if (errors.length > 0) {
				return {
					ok: false,
					errors,
				} as ConfigApplyResult;
			}

			// Save the config
			try {
				await saveConfig(cfg);
				return { ok: true } as ConfigApplyResult;
			} catch (error) {
				return {
					ok: false,
					errors: [error instanceof Error ? error.message : String(error)],
				} as ConfigApplyResult;
			}
		},

		"config.validate": async (
			_method: string,
			params: unknown,
			_client: GatewayClient,
		) => {
			const p = params as Record<string, unknown> | undefined;
			if (!p || typeof p !== "object") {
				return {
					valid: false,
					errors: ["config parameter is required and must be an object"],
				} as ConfigValidateResult;
			}

			const errors: string[] = [];

			for (const [key, value] of Object.entries(p)) {
				const validationErrors = validateConfigValue(key, value);
				if (validationErrors.length > 0) {
					errors.push(...validationErrors);
				}
			}

			return {
				valid: errors.length === 0,
				errors: errors.length > 0 ? errors : undefined,
			} as ConfigValidateResult;
		},
	};
}
