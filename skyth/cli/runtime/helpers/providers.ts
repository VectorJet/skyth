import { dirname, join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getDataDir, getProviderTokensPath, loadConfig } from "@/config/loader";
import { AISDKProvider } from "@/providers/ai_sdk_provider";
import { parseModelRef } from "@/providers/registry";

export function ensureDataDir(): void {
	const dataDir = getDataDir();
	mkdirSync(dataDir, { recursive: true });
}

export function makeProviderFromConfig(modelOverride?: string): AISDKProvider {
	const cfg = loadConfig();
	const model = modelOverride || cfg.agents.defaults.model;
	const providerName = parseModelRef(model).providerID;
	const p = (cfg.providers as Record<string, any>)[providerName] as
		| { api_key?: string; api_base?: string }
		| undefined;
	const token = readProviderTokens()[providerName];
	return new AISDKProvider({
		api_key: p?.api_key || token || undefined,
		api_base: p?.api_base || cfg.getApiBase(model) || undefined,
		default_model: model,
		provider_name: providerName || undefined,
	});
}

export function readProviderTokens(): Record<string, string> {
	const path = getProviderTokensPath();
	if (!existsSync(path)) return {};
	try {
		const raw = JSON.parse(readFileSync(path, "utf-8"));
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
		return raw as Record<string, string>;
	} catch {
		return {};
	}
}

export function saveProviderToken(providerID: string, token: string): void {
	const path = getProviderTokensPath();
	mkdirSync(dirname(path), { recursive: true });
	const current = readProviderTokens();
	current[providerID] = token;
	writeFileSync(path, JSON.stringify(current, null, 2), "utf-8");
}
