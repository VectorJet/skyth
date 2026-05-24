import {
	getModels,
	getProviders,
	type Api,
	type KnownProvider,
	type Model,
} from "@earendil-works/pi-ai";
import { parsePiModelRef } from "@/pi/model";

export interface ProviderSpec {
	name: string;
	keywords: string[];
	env_key: string;
	display_name?: string;
	model_prefix?: string;
	skip_prefixes?: string[];
	is_gateway?: boolean;
	detect_by_key_prefix?: string;
	detect_by_base_keyword?: string;
	default_api_base?: string;
	strip_model_prefix?: boolean;
	is_oauth?: boolean;
}

export interface ModelsDevModel {
	id: string;
	name?: string;
	status?: string;
	provider?: { npm?: string; api?: string };
	options?: Record<string, unknown>;
	headers?: Record<string, string>;
	temperature?: boolean;
	tool_call?: boolean;
	limit?: {
		context?: number;
		output?: number;
	};
}

export interface ModelsDevProvider {
	id: string;
	name: string;
	env?: string[];
	npm?: string;
	api?: string;
	models: Record<string, ModelsDevModel>;
}

export interface ModelSDKInfo {
	npm: string;
	apiBase?: string;
	headers?: Record<string, string>;
	temperature?: boolean;
	toolCall?: boolean;
	status?: string;
}

export interface ModelLimits {
	contextWindow?: number;
	maxOutput?: number;
}

const PROVIDER_OVERRIDES: Record<string, Partial<ProviderSpec>> = {
	openrouter: {
		env_key: "OPENROUTER_API_KEY",
		is_gateway: true,
		detect_by_key_prefix: "sk-or-",
		detect_by_base_keyword: "openrouter",
		default_api_base: "https://openrouter.ai/api/v1",
	},
	openai_codex: { env_key: "", is_oauth: true },
	github_copilot: { env_key: "", is_oauth: true },
	opencode: {
		env_key: "OPENCODE_API_KEY",
		default_api_base: "https://opencode.ai/zen/v1",
	},
	opencode_go: {
		env_key: "OPENCODE_GO_API_KEY",
		default_api_base: "https://opencode.ai/zen/v1",
	},
};

let catalogCache: Record<string, ModelsDevProvider> | undefined;

function normalizeProviderId(value: string): string {
	return value.replaceAll("-", "_");
}

function denormalizeProviderId(value: string): KnownProvider {
	return value.replaceAll("_", "-") as KnownProvider;
}

function keywordsFor(provider: string, displayName: string): string[] {
	const out = new Set<string>();
	for (const part of [provider, displayName]) {
		const lower = part.toLowerCase();
		out.add(lower);
		out.add(lower.replaceAll("-", "_"));
		for (const token of lower.split(/[\s/_-]+/g)) {
			if (token) out.add(token);
		}
	}
	return [...out];
}

function providerEnvKey(id: string): string {
	return `${normalizeProviderId(id).toUpperCase()}_API_KEY`;
}

function specFromProvider(provider: string): ProviderSpec {
	const name = normalizeProviderId(provider);
	const displayName = name
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
	return {
		name,
		keywords: keywordsFor(provider, displayName),
		env_key: providerEnvKey(provider),
		model_prefix: name,
		...(PROVIDER_OVERRIDES[name] ?? {}),
	};
}

function modelToCatalogEntry(model: Model<Api>): ModelsDevModel {
	return {
		id: model.id,
		name: model.name,
		provider: { api: model.baseUrl },
		headers: model.headers,
		temperature: true,
		tool_call: true,
		limit: {
			context: model.contextWindow,
			output: model.maxTokens,
		},
	};
}

export const STATIC_PROVIDERS: ProviderSpec[] = getProviders().map((provider) =>
	specFromProvider(provider),
);

export const PROVIDERS: ProviderSpec[] = STATIC_PROVIDERS;

export async function loadModelsDevCatalog(_options?: {
	forceRefresh?: boolean;
	disableFetch?: boolean;
	url?: string;
	fallbackUrl?: string;
}): Promise<Record<string, ModelsDevProvider>> {
	if (catalogCache) return catalogCache;
	const catalog: Record<string, ModelsDevProvider> = {};
	for (const provider of getProviders()) {
		const normalized = normalizeProviderId(provider);
		const models = Object.fromEntries(
			getModels(provider).map((model) => [
				model.id,
				modelToCatalogEntry(model),
			]),
		);
		catalog[normalized] = {
			id: normalized,
			name: specFromProvider(provider).display_name ?? normalized,
			env: [providerEnvKey(provider)],
			api: Object.values(models)[0]?.provider?.api,
			models,
		};
	}
	catalogCache = catalog;
	return catalog;
}

export async function listProviderSpecs(options?: {
	disabledProviders?: string[];
	enabledProviders?: string[];
	includeDynamic?: boolean;
	disableFetch?: boolean;
	forceRefresh?: boolean;
}): Promise<ProviderSpec[]> {
	void options?.includeDynamic;
	void options?.disableFetch;
	void options?.forceRefresh;
	const disabled = new Set(
		(options?.disabledProviders ?? []).map(normalizeProviderId),
	);
	const enabled = options?.enabledProviders
		? new Set(options.enabledProviders.map(normalizeProviderId))
		: undefined;
	return STATIC_PROVIDERS.filter((spec) => {
		if (disabled.has(spec.name)) return false;
		if (enabled && !enabled.has(spec.name)) return false;
		return true;
	});
}

export function findByName(name: string): ProviderSpec | undefined {
	const normalized = normalizeProviderId(name);
	return STATIC_PROVIDERS.find((p) => p.name === normalized);
}

export function findByModel(model: string): ProviderSpec | undefined {
	const parsed = parsePiModelRef(model);
	return findByName(parsed.provider);
}

export function findGateway(
	providerName?: string,
	apiKey?: string,
	apiBase?: string,
): ProviderSpec | undefined {
	if (providerName) {
		const byName = findByName(providerName);
		if (byName?.is_gateway) return byName;
	}
	if (apiKey) {
		const byKey = STATIC_PROVIDERS.find(
			(p) =>
				p.is_gateway &&
				p.detect_by_key_prefix &&
				apiKey.startsWith(p.detect_by_key_prefix),
		);
		if (byKey) return byKey;
	}
	if (apiBase) {
		const lower = apiBase.toLowerCase();
		const byBase = STATIC_PROVIDERS.find(
			(p) =>
				p.is_gateway &&
				p.detect_by_base_keyword &&
				lower.includes(p.detect_by_base_keyword),
		);
		if (byBase) return byBase;
	}
	return undefined;
}

export function parseModelRef(input: string): {
	providerID: string;
	modelID: string;
} {
	const parsed = parsePiModelRef(input);
	return {
		providerID: normalizeProviderId(parsed.provider),
		modelID: parsed.model,
	};
}

export function preferredSmallModelCandidates(providerID: string): string[] {
	const normalized = normalizeProviderId(providerID);
	if (normalized === "github_copilot") {
		return ["gpt-5-mini", "claude-haiku-4.5", "gpt-5-nano"];
	}
	if (normalized.startsWith("opencode")) return ["gpt-5-nano"];
	return [
		"claude-haiku-4-5",
		"claude-haiku-4.5",
		"gemini-3-flash",
		"gemini-2.5-flash",
		"gpt-5-nano",
	];
}

export function resolveModelSDKInfo(
	providerID: string,
	modelID: string,
): ModelSDKInfo | undefined {
	const model = getModels(denormalizeProviderId(providerID)).find(
		(candidate) => candidate.id === modelID,
	);
	if (!model) return undefined;
	return {
		npm: "@earendil-works/pi-ai",
		apiBase: model.baseUrl,
		headers: model.headers,
		temperature: true,
		toolCall: true,
	};
}

export function getModelLimits(
	model: string,
	catalog?: Record<string, ModelsDevProvider>,
): ModelLimits {
	const parsed = parseModelRef(model);
	const catalogProvider =
		catalog?.[parsed.providerID] ??
		catalog?.[parsed.providerID.replaceAll("_", "-")];
	const catalogModel = catalogProvider?.models[parsed.modelID];
	if (catalogModel) {
		return {
			contextWindow: catalogModel.limit?.context,
			maxOutput: catalogModel.limit?.output,
		};
	}
	const piModel = getModels(denormalizeProviderId(parsed.providerID)).find(
		(candidate) => candidate.id === parsed.modelID,
	);
	return {
		contextWindow: piModel?.contextWindow,
		maxOutput: piModel?.maxTokens,
	};
}
