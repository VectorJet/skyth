/**
 * Provider credential resolution against Skyth config + Quasar secret store,
 * normalized into the shape Pi's `streamSimple`/`completeSimple` expect.
 *
 * Today the underlying storage is:
 *   - Skyth `Config.providers[id].api_key` / `api_base` (plaintext per-config)
 *   - Quasar-encrypted secret store at `~/.skyth/quasar/secrets.quasardb`
 *     under namespace `secrets`, scope `providers`, subject `<providerID>`,
 *     keyPath `api_key`.
 *
 * Onboarding, configure, status, and the future Pi-backed provider all read
 * and write provider credentials through this module so the storage layer is
 * a single, replaceable component.
 */

import { loadConfig } from "@/config/loader";
import { resolvePiProviderId } from "@/pi/model";
import {
	persistSecretValueSync,
	readLatestSecretValueSync,
} from "@/config/quasar-secret-store";
import {
	readProviderTokens,
	saveProviderToken,
} from "@/cli/runtime/helpers/providers";

export interface PiProviderCredential {
	/** Normalized Skyth provider id (e.g. `github_copilot`). */
	providerID: string;
	/** Pi-normalized provider id (e.g. `github-copilot`). */
	piProviderID: string;
	apiKey?: string;
	apiBase?: string;
	headers?: Record<string, string>;
}

function normalizeSkythProviderId(value: string): string {
	return value.trim().replaceAll("-", "_").toLowerCase();
}

/**
 * Read the credential for a single provider, merging Skyth config fields
 * with any Quasar-encrypted override.
 */
export function getProviderCredential(
	providerID: string,
): PiProviderCredential {
	const skythId = normalizeSkythProviderId(providerID);
	const cfg = loadConfig();
	const configEntry = (cfg.providers as Record<
		string,
		{ api_key?: string; api_base?: string } | undefined
	>)[skythId];

	const quasarKey = readLatestSecretValueSync({
		scope: "providers",
		subject: skythId,
		keyPath: "api_key",
	});

	return {
		providerID: skythId,
		piProviderID: resolvePiProviderId(skythId),
		apiKey: quasarKey || configEntry?.api_key || undefined,
		apiBase: configEntry?.api_base || undefined,
	};
}

/**
 * List all known providers that currently have a usable credential.
 * Useful for status pages and onboarding `which providers am I logged in to`.
 */
export function listConfiguredProviders(): PiProviderCredential[] {
	const cfg = loadConfig();
	const tokens = readProviderTokens();
	const ids = new Set<string>([
		...Object.keys((cfg.providers as Record<string, unknown>) ?? {}),
		...Object.keys(tokens),
	]);
	const out: PiProviderCredential[] = [];
	for (const rawId of ids) {
		const credential = getProviderCredential(rawId);
		if (credential.apiKey || credential.apiBase) out.push(credential);
	}
	return out;
}

/**
 * Persist a provider api key. Routes through the Quasar secret store so the
 * value is never written plaintext into the Skyth config file.
 */
export function setProviderApiKey(providerID: string, apiKey: string): void {
	const skythId = normalizeSkythProviderId(providerID);
	const value = apiKey.trim();
	if (!value) return;
	persistSecretValueSync({
		scope: "providers",
		subject: skythId,
		keyPath: "api_key",
		value,
	});
	// Keep the legacy provider_tokens.json path warm so existing readers
	// (e.g. `makeProviderFromConfig`) pick up the value without race.
	saveProviderToken(skythId, value);
}

/**
 * Build the subset of Pi `SimpleStreamOptions` that is sourced from
 * credentials. The caller composes this with model/messages/tools.
 */
export function buildPiStreamCredentials(
	providerID: string,
): Pick<PiProviderCredential, "apiKey" | "apiBase" | "headers"> {
	const credential = getProviderCredential(providerID);
	return {
		apiKey: credential.apiKey,
		apiBase: credential.apiBase,
		headers: credential.headers,
	};
}
