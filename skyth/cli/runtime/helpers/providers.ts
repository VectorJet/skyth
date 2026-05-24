import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { getDataDir, getProviderTokensPath, loadConfig } from "@/config/loader";
import type { LLMProvider } from "@/providers/base";

import { createPiProvider } from "@/pi/factory";
import { parseModelRef } from "@/pi/catalog";
import {
	persistSecretValueSync,
	readLatestSecretValueSync,
} from "@/config/quasar-secret-store";

export function ensureDataDir(): void {
	const dataDir = getDataDir();
	mkdirSync(dataDir, { recursive: true });
}

export function makeProviderFromConfig(modelOverride?: string): LLMProvider {
	const cfg = loadConfig();
	const model = modelOverride || cfg.agents.defaults.model;
	return createPiProvider({ modelOverride: model });
}

export function readProviderTokens(): Record<string, string> {
	const path = getProviderTokensPath();
	const out: Record<string, string> = {};
	for (const providerID of [
		"anthropic",
		"deepseek",
		"github_copilot",
		"openai",
		"openai_codex",
		"opencode",
		"opencode_go",
		"openrouter",
	]) {
		const value = readLatestSecretValueSync({
			scope: "providers",
			subject: providerID,
			keyPath: "api_key",
		});
		if (value) out[providerID] = value;
	}
	if (!existsSync(path)) return out;
	try {
		const raw = JSON.parse(readFileSync(path, "utf-8"));
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
		return { ...(raw as Record<string, string>), ...out };
	} catch {
		return out;
	}
}

export function saveProviderToken(providerID: string, token: string): void {
	persistSecretValueSync({
		scope: "providers",
		subject: providerID,
		keyPath: "api_key",
		value: token,
	});
}
