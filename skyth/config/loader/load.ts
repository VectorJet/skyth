import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import YAML from "yaml";
import {
	PROVIDER_SECRET_PATHS,
	REDACTED_BLOCK,
	TOOL_SECRET_PATHS,
	cloneObject,
	deepGet,
	deepSet,
	isRedactedBlock,
	persistSecretValue,
	readLatestSecretValue,
} from "@/auth/secret_store";
import { hydrateSecretField } from "./secrets";
import { Config } from "@/config/schema";
import { loadChannelsConfig, saveChannelsConfig } from "./channels";
import { sanitizeConfigInput, migrateConfig } from "./migration";
import {
	getConfigPath,
	getRuntimeConfigPath,
	getApiKeysPath,
	getMcpConfigFile,
	getLegacyConfigPath,
	getChannelsDirPath,
} from "./paths";

function normalizePhase1Fields(cfg: Config): Config {
	cfg.normalizePhase1();
	return cfg;
}

function loadModularConfig(phase1Path: string): Config {
	const phase1Raw = existsSync(phase1Path)
		? (YAML.parse(readFileSync(phase1Path, "utf-8")) ?? {})
		: {};
	const runtimePath = getRuntimeConfigPath();
	const apiKeysPath = getApiKeysPath();

	const runtimeRaw = existsSync(runtimePath)
		? JSON.parse(readFileSync(runtimePath, "utf-8"))
		: {};
	const runtimeStorage = cloneObject(runtimeRaw as Record<string, any>);
	let runtimeMigrated = false;
	for (const secretPath of TOOL_SECRET_PATHS) {
		runtimeMigrated =
			hydrateSecretField({
				runtimeObject: runtimeRaw as Record<string, any>,
				storageObject: runtimeStorage,
				path: `tools.${secretPath}`,
				scope: "tools",
				subject: "runtime",
			}) || runtimeMigrated;
	}

	if (runtimeMigrated) {
		writeFileSync(
			runtimePath,
			JSON.stringify(runtimeStorage, null, 2),
			"utf-8",
		);
	}

	const websearchStorage = cloneObject(runtimeRaw as Record<string, any>);
	for (const provider of Object.keys(
		websearchStorage.websearch?.providers ?? {},
	)) {
		const apiKey = websearchStorage.websearch.providers[provider]?.api_key;
		if (apiKey && !isRedactedBlock(apiKey)) {
			persistSecretValue({
				scope: "websearch",
				subject: provider,
				keyPath: "api_key",
				value: apiKey,
			});
			deepSet(
				websearchStorage,
				`websearch.providers.${provider}.api_key`,
				REDACTED_BLOCK,
			);
		}
	}
	if (JSON.stringify(websearchStorage) !== JSON.stringify(runtimeRaw)) {
		writeFileSync(
			runtimePath,
			JSON.stringify(websearchStorage, null, 2),
			"utf-8",
		);
	}

	for (const provider of Object.keys(runtimeRaw.websearch?.providers ?? {})) {
		const storedKey = readLatestSecretValue({
			scope: "websearch",
			subject: provider,
			keyPath: "api_key",
		});
		if (storedKey) {
			deepSet(runtimeRaw, `websearch.providers.${provider}.api_key`, storedKey);
		}
	}

	const mcpBase = String(phase1Raw.mcp_config_path ?? "~/.skyth/config/mcp/");
	const mcpFile = getMcpConfigFile(mcpBase);
	const mcpRaw = existsSync(mcpFile)
		? JSON.parse(readFileSync(mcpFile, "utf-8"))
		: {};
	const apiRaw = existsSync(apiKeysPath)
		? JSON.parse(readFileSync(apiKeysPath, "utf-8"))
		: {};
	const apiStorage = cloneObject(apiRaw as Record<string, any>);
	let apiMigrated = false;
	for (const providerName of Object.keys(apiRaw ?? {})) {
		const runtimeProvider = (apiRaw as Record<string, any>)[providerName];
		const storageProvider = (apiStorage as Record<string, any>)[providerName];
		if (!runtimeProvider || typeof runtimeProvider !== "object") continue;
		for (const secretPath of PROVIDER_SECRET_PATHS) {
			apiMigrated =
				hydrateSecretField({
					runtimeObject: runtimeProvider,
					storageObject: storageProvider,
					path: secretPath,
					scope: "providers",
					subject: providerName,
				}) || apiMigrated;
		}
	}
	if (apiMigrated) {
		writeFileSync(apiKeysPath, JSON.stringify(apiStorage, null, 2), "utf-8");
	}

	const data: any = {};
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
		if (phase1Raw[key] !== undefined) data[key] = phase1Raw[key];
	}
	for (const key of ["agents", "gateway", "tools", "websearch"]) {
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
	if (
		mcpRaw &&
		typeof mcpRaw === "object" &&
		mcpRaw.mcpServers &&
		typeof mcpRaw.mcpServers === "object"
	) {
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
			const cfg = normalizePhase1Fields(
				Config.from(sanitizeConfigInput(migrateConfig(data))),
			);
			try {
				saveConfig(cfg, phase1Path).catch(() => {});
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

export async function saveConfig(config: Config, configPath?: string): Promise<void> {
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

	const runtimePayload: any = cloneObject({
		agents: cfg.agents,
		gateway: cfg.gateway,
		tools: { ...cfg.tools },
		websearch: { ...cfg.websearch },
	});
	delete runtimePayload.tools.mcp_servers;

	const providerPayload = cloneObject(cfg.providers as Record<string, any>);
	for (const providerName of Object.keys(providerPayload)) {
		for (const secretPath of PROVIDER_SECRET_PATHS) {
			const value = deepGet(providerPayload[providerName], secretPath);
			if (typeof value !== "string") continue;
			const trimmed = value.trim();
			if (!trimmed || isRedactedBlock(trimmed)) continue;
			persistSecretValue({
				scope: "providers",
				subject: providerName,
				keyPath: secretPath,
				value: trimmed,
			});
			deepSet(providerPayload[providerName], secretPath, REDACTED_BLOCK);
		}
	}

	for (const secretPath of TOOL_SECRET_PATHS) {
		const runtimePathKey = `tools.${secretPath}`;
		const value = deepGet(runtimePayload, runtimePathKey);
		if (typeof value !== "string") continue;
		const trimmed = value.trim();
		if (!trimmed || isRedactedBlock(trimmed)) continue;
		persistSecretValue({
			scope: "tools",
			subject: "runtime",
			keyPath: runtimePathKey,
			value: trimmed,
		});
		deepSet(runtimePayload, runtimePathKey, REDACTED_BLOCK);
	}

	for (const provider of Object.keys(
		runtimePayload.websearch?.providers ?? {},
	)) {
		const apiKey = runtimePayload.websearch.providers[provider]?.api_key;
		if (typeof apiKey !== "string") continue;
		const trimmed = apiKey.trim();
		if (!trimmed || isRedactedBlock(trimmed)) continue;
		persistSecretValue({
			scope: "websearch",
			subject: provider,
			keyPath: "api_key",
			value: trimmed,
		});
		deepSet(
			runtimePayload,
			`websearch.providers.${provider}.api_key`,
			REDACTED_BLOCK,
		);
	}

	const mcpPayload = {
		mcpServers: Object.fromEntries(
			Object.entries(cfg.tools.mcp_servers).map(([name, server]: any) => [
				name,
				{ ...server },
			]),
		),
	};

	writeFileSync(phase1Path, YAML.stringify(phase1Payload), "utf-8");
	writeFileSync(runtimePath, JSON.stringify(runtimePayload, null, 2), "utf-8");
	writeFileSync(apiKeysPath, JSON.stringify(providerPayload, null, 2), "utf-8");
	writeFileSync(mcpPath, JSON.stringify(mcpPayload, null, 2), "utf-8");
	// Keep channels in dedicated files and do not overwrite existing channel configs.
	await saveChannelsConfig(cfg.channels, false);
}
