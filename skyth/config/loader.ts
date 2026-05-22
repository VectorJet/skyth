// Modularized re-exports from config/loader subdirectory
// This file maintains backward compatibility while delegating to modular files

import { loadConfig, saveConfig } from "./loader/load";
export { loadConfig, saveConfig };

import {
	getConfigPath,
	getRuntimeConfigPath,
	getChannelsDirPath,
	getApiKeysPath,
	getProviderTokensPath,
	getLegacyConfigPath,
	getMcpConfigFile,
	getDataDir,
} from "./loader/paths";
export {
	getConfigPath,
	getRuntimeConfigPath,
	getChannelsDirPath,
	getApiKeysPath,
	getProviderTokensPath,
	getLegacyConfigPath,
	getMcpConfigFile,
	getDataDir,
};

import { loadChannelsConfig, saveChannelsConfig } from "./loader/channels";
export { loadChannelsConfig, saveChannelsConfig };

import { sanitizeConfigInput, migrateConfig } from "./loader/migration";
export { sanitizeConfigInput, migrateConfig };
