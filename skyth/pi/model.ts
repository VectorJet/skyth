import type { PiModelRef } from "@/pi/types";

/**
 * Map Skyth provider id aliases to Pi `KnownProvider` ids.
 * Skyth normalizes provider ids with `_` separators; Pi uses `-`.
 */
const PROVIDER_ALIASES: Record<string, string> = {
	openai_codex: "openai-codex",
	github_copilot: "github-copilot",
	opencode_go: "opencode-go",
	azure_openai_responses: "azure-openai-responses",
	amazon_bedrock: "amazon-bedrock",
	google_vertex: "google-vertex",
	cloudflare_workers_ai: "cloudflare-workers-ai",
	cloudflare_ai_gateway: "cloudflare-ai-gateway",
	moonshotai_cn: "moonshotai-cn",
	minimax_cn: "minimax-cn",
	xiaomi_token_plan_cn: "xiaomi-token-plan-cn",
	xiaomi_token_plan_ams: "xiaomi-token-plan-ams",
	xiaomi_token_plan_sgp: "xiaomi-token-plan-sgp",
};

function normalizeProviderId(raw: string): string {
	const lower = raw.toLowerCase();
	if (PROVIDER_ALIASES[lower]) return PROVIDER_ALIASES[lower];
	return lower.replaceAll("_", "-");
}

/**
 * Parse a Skyth-style `provider/model` (or bare `model`) string into the
 * `(provider, model)` pair Pi's `getModel` expects.
 *
 * Rules:
 * - `provider/model`              -> `{ provider, model }` with the provider
 *   id normalized to Pi's `-` convention.
 * - `provider/sub/model`          -> the first segment is taken as the
 *   provider; everything after the first `/` is the model id (e.g.
 *   `openrouter/anthropic/claude-3-5-sonnet`).
 * - bare `model`                  -> `{ provider: "openai", model }` as the
 *   conventional default (matches `skyth/providers/registry.parseModelRef`).
 */
export function parsePiModelRef(input: string): PiModelRef {
	const firstSlash = input.indexOf("/");
	if (firstSlash === -1) {
		return { provider: "openai", model: input };
	}
	const providerSegment = input.slice(0, firstSlash);
	const model = input.slice(firstSlash + 1);
	return { provider: normalizeProviderId(providerSegment), model };
}

/**
 * Resolve a Skyth provider id (`opencode`, `github_copilot`, ...) to its
 * Pi `KnownProvider` form independently of any model id.
 */
export function resolvePiProviderId(skythProviderId: string): string {
	return normalizeProviderId(skythProviderId);
}
