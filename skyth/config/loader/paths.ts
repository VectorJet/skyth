import { homedir } from "node:os";
import { join } from "node:path";
import { getDataPath } from "@/utils/helpers";

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
	const base = (mcpConfigPath ?? "~/.skyth/config/mcp/").replace(
		/^~\//,
		`${homePath()}/`,
	);
	return join(base, "mcp_config.json");
}

export function getDataDir(): string {
	return getDataPath();
}