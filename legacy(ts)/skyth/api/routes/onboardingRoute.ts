import { runOnboarding, type OnboardingArgs } from "@/cli/cmd/onboarding/index";
import { existsSync } from "node:fs";
import {
	getConfigPath,
	getLegacyConfigPath,
	getRuntimeConfigPath,
} from "@/config/loader";
import {
	listProviderSpecs,
	loadModelsDevCatalog,
} from "@/providers/registry";
import { hasSuperuserPasswordRecord } from "@/auth/superuser";

export type OnboardingRequest = OnboardingArgs;

export interface OnboardingResponse {
	success: boolean;
	message?: string;
	error?: string;
}


export function isOnboardingComplete(): boolean {
	return (
		existsSync(getConfigPath()) ||
		existsSync(getRuntimeConfigPath()) ||
		existsSync(getLegacyConfigPath())
	);
}

const PROVIDER_LABEL_OVERRIDES: Record<string, string> = {
	anthropic: "Anthropic",
	deepseek: "DeepSeek",
	github_copilot: "GitHub Copilot",
	google: "Google",
	openai: "OpenAI",
	openai_codex: "OpenAI Codex",
	opencode: "OpenCode Zen",
	opencode_zen: "OpenCode Zen",
	opencode_go: "OpenCode Go",
	opencode_go_zen: "OpenCode Zen",
	openrouter: "OpenRouter",
	vercel: "Vercel AI Gateway",
	vercel_ai_gateway: "Vercel AI Gateway",
};

function normalizeProviderID(value: string): string {
	return value
		.trim()
		.replace(/^@ai-sdk\//, "")
		.replaceAll("-", "_");
}

function toTitleCaseToken(token: string): string {
	if (!token) return token;
	if (token.length <= 3) return token.toUpperCase();
	return token[0]!.toUpperCase() + token.slice(1).toLowerCase();
}

function formatProviderLabel(providerID: string): string {
	const normalized = normalizeProviderID(providerID);
	const override = PROVIDER_LABEL_OVERRIDES[normalized];
	if (override) return override;
	return normalized
		.split(/[_\s]+/g)
		.map((token) => toTitleCaseToken(token))
		.join(" ");
}

function buildModelRef(providerID: string, modelID: string): string {
	const normalizedProvider = normalizeProviderID(providerID);
	const trimmedModel = modelID.trim();
	if (!trimmedModel) return "";
	const normalizedModel = trimmedModel.replaceAll("-", "_");
	if (normalizedModel.startsWith(`${normalizedProvider}/`)) {
		return `${normalizedProvider}/${trimmedModel.split("/").slice(1).join("/")}`;
	}
	return `${normalizedProvider}/${trimmedModel}`;
}

export async function getOnboardingMetadata() {
	const specs = await listProviderSpecs({ includeDynamic: true });
	const catalog = await loadModelsDevCatalog();

	const providers = new Map<
		string,
		{ value: string; label: string; hint?: string; isOAuth: boolean }
	>();

	for (const spec of specs) {
		const id = normalizeProviderID(spec.name);
		if (!id) continue;

		if (id === "opencode_go") {
			providers.set("opencode_go", {
				value: "opencode_go",
				label: "OpenCode Go",
				hint: undefined,
				isOAuth: false,
			});
			continue;
		}

		if (!providers.has(id)) {
			providers.set(id, {
				value: id,
				label: formatProviderLabel(id),
				hint: spec.is_oauth ? "OAuth" : undefined,
				isOAuth: Boolean(spec.is_oauth),
			});
		}
	}

	let providerOptions = [...providers.values()].sort((a, b) => {
		if (a.value === "opencode") return -1;
		if (b.value === "opencode") return 1;
		return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
	});

	const opencodeIndex = providerOptions.findIndex((o) => o.value === "opencode");
	if (opencodeIndex >= 0) {
		providerOptions[opencodeIndex]!.label = "OpenCode Zen (recommended)";
		providerOptions[opencodeIndex]!.hint = "recommended";
	}

	const modelsByProvider: Record<string, { value: string; label: string }[]> = {};
	for (const provider of Object.values(catalog)) {
		const normalizedProvider = provider.id.replaceAll("-", "_");
		if (!modelsByProvider[normalizedProvider]) {
			modelsByProvider[normalizedProvider] = [];
		}
		
		const providerLabel = provider.name?.trim() || formatProviderLabel(provider.id);
		for (const [modelID, modelDef] of Object.entries(provider.models ?? {})) {
			const ref = buildModelRef(provider.id, modelID);
			if (!ref) continue;
			const name = modelDef?.name?.trim() || modelID;
			modelsByProvider[normalizedProvider].push({
				value: ref,
				label: `${providerLabel} / ${name}`,
			});
		}
	}

	return {
		providers: providerOptions,
		modelsByProvider,
		hasSuperuser: hasSuperuserPasswordRecord(),
	};
}

export async function handleOnboardingRequest(
	req: OnboardingRequest,
): Promise<OnboardingResponse> {
	try {
		const result = await runOnboarding(req);
		return { success: true, message: result };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}


