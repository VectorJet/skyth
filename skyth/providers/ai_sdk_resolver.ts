import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
	findByName,
	parseModelRef,
	resolveModelSDKInfo,
	type ProviderSpec,
} from "@/pi/catalog";

export interface SDKResolverOpts {
	apiKey?: string;
	apiBase?: string;
	defaultModel: string;
	providerID?: string;
	gateway?: ProviderSpec;
}

const BUNDLED_FACTORIES: Record<string, (opts: Record<string, any>) => any> = {
	"@ai-sdk/anthropic": (opts) =>
		createAnthropic({
			apiKey: opts.apiKey,
			baseURL: opts.baseURL,
			headers: opts.headers,
		}),
	"@ai-sdk/openai": (opts) =>
		createOpenAI({
			apiKey: opts.apiKey,
			baseURL: opts.baseURL,
			headers: opts.headers,
		}),
	"@ai-sdk/google": (opts) =>
		createGoogleGenerativeAI({
			apiKey: opts.apiKey,
			baseURL: opts.baseURL,
			headers: opts.headers,
		}),
	"@ai-sdk/openai-compatible": (opts) =>
		createOpenAICompatible({
			name: opts.name,
			baseURL: opts.baseURL ?? "",
			apiKey: opts.apiKey,
			headers: opts.headers,
			includeUsage: opts.includeUsage,
		}),
};

function providerDefaultOptions(providerID: string): Record<string, any> {
	switch (providerID) {
		case "kilo":
		case "openrouter":
			return {
				headers: {
					"HTTP-Referer": "https://skyth.local/",
					"X-Title": "Skyth",
				},
			};
		case "llmgateway":
			return {
				headers: {
					"HTTP-Referer": "https://skyth.local/",
					"X-Title": "Skyth",
					"X-Source": "skyth",
				},
			};
		case "nvidia":
			return {
				headers: {
					"HTTP-Referer": "https://skyth.local/",
					"X-Title": "Skyth",
					"X-BILLING-INVOKE-ORIGIN": "Skyth",
				},
			};
		case "vercel":
			return {
				headers: {
					"http-referer": "https://skyth.local/",
					"x-title": "Skyth",
				},
			};
		default:
			return {};
	}
}

function mergeHeaders(
	...values: Array<Record<string, string> | undefined>
): Record<string, string> | undefined {
	const merged = Object.assign({}, ...values.filter(Boolean));
	return Object.keys(merged).length ? merged : undefined;
}

const sdkCache = new Map<string, any>();

async function installSDKPackage(pkg: string): Promise<string> {
	const cacheDir = join(homedir(), ".skyth", "cache", "sdk");
	const pkgJsonPath = join(cacheDir, "package.json");
	mkdirSync(cacheDir, { recursive: true });

	let pkgJson: { dependencies?: Record<string, string> } = {};
	if (existsSync(pkgJsonPath)) {
		try {
			pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
		} catch {
			/* ignore */
		}
	}
	if (!pkgJson.dependencies) pkgJson.dependencies = {};

	const modPath = join(cacheDir, "node_modules", pkg);
	if (existsSync(modPath) && pkgJson.dependencies[pkg]) {
		return modPath;
	}

	const proc = Bun.spawnSync(
		["bun", "add", "--exact", "--cwd", cacheDir, `${pkg}@latest`],
		{
			cwd: cacheDir,
			env: { ...process.env, BUN_BE_BUN: "1" },
		},
	);
	if (proc.exitCode !== 0) {
		throw new Error(`Failed to install ${pkg}: ${proc.stderr.toString()}`);
	}

	try {
		const installed = JSON.parse(
			readFileSync(join(modPath, "package.json"), "utf-8"),
		);
		if (installed?.version) pkgJson.dependencies[pkg] = installed.version;
	} catch {
		/* ignore */
	}
	writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2), "utf-8");

	return modPath;
}

export async function resolveSDK(
	resolvedModelID: string,
	opts: SDKResolverOpts,
): Promise<any> {
	const { apiKey, apiBase, defaultModel, gateway } = opts;
	const providerID = opts.providerID ?? parseModelRef(defaultModel).providerID;

	if (gateway) {
		return createOpenAICompatible({
			name: gateway.name,
			baseURL: apiBase ?? gateway.default_api_base ?? "",
			apiKey,
		});
	}

	const spec = findByName(providerID);
	const sdkInfo = resolveModelSDKInfo(providerID, resolvedModelID);
	const npm = sdkInfo?.npm ?? "@ai-sdk/openai-compatible";
	const baseURL = apiBase ?? sdkInfo?.apiBase ?? spec?.default_api_base;
	const needsBaseURL = npm === "@ai-sdk/openai-compatible";

	if (!baseURL && needsBaseURL) {
		throw new Error(
			`No API base URL for provider "${providerID}". Configure api_base in ~/.skyth/config.yaml under providers.${providerID}.`,
		);
	}

	const providerDefaults = providerDefaultOptions(providerID);
	const headers = mergeHeaders(providerDefaults.headers, sdkInfo?.headers);
	const factoryOpts: Record<string, any> = {
		name: providerID,
		...providerDefaults,
		apiKey,
		baseURL,
	};
	if (headers) factoryOpts.headers = headers;
	if (npm.includes("@ai-sdk/openai-compatible")) {
		factoryOpts.includeUsage ??= true;
	}

	const bundled = BUNDLED_FACTORIES[npm];
	if (bundled) return bundled(factoryOpts);

	const cacheKey = JSON.stringify({
		npm,
		providerID,
		apiKey: Boolean(apiKey),
		baseURL: baseURL ?? "",
		headers,
	});
	const cached = sdkCache.get(cacheKey);
	if (cached) return cached;

	try {
		const modPath = await installSDKPackage(npm);
		const mod = await import(modPath);
		const createFn = mod[Object.keys(mod).find((k) => k.startsWith("create"))!];
		if (typeof createFn !== "function")
			throw new Error(`No create* export in ${npm}`);
		const sdk = createFn(factoryOpts);
		sdkCache.set(cacheKey, sdk);
		return sdk;
	} catch {
		if (!baseURL)
			throw new Error(`No API base URL for provider "${providerID}"`);
		const fallback = createOpenAICompatible({
			name: providerID,
			baseURL,
			apiKey,
			headers,
			includeUsage: factoryOpts.includeUsage,
		});
		sdkCache.set(cacheKey, fallback);
		return fallback;
	}
}
