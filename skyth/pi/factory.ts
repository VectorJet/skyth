/**
 * Construct a `PiProvider` from current Skyth config. Mirrors the contract
 * of `makeProviderFromConfig` in `cli/runtime/helpers/providers` so the
 * gateway boot path can swap providers in one place.
 */

import { loadConfig } from "@/config/loader";
import { PiProvider, type PiStreamEngine } from "@/pi/provider";
import { parsePiModelRef } from "@/pi/model";

export interface CreatePiProviderOptions {
	modelOverride?: string;
	providerOverride?: string;
	engine?: PiStreamEngine;
}

export function createPiProvider(
	options: CreatePiProviderOptions = {},
): PiProvider {
	const cfg = loadConfig();
	const defaultModel =
		options.modelOverride ||
		cfg.primary_model ||
		cfg.agents?.defaults?.model ||
		"openai/gpt-5-mini";
	const providerOverride =
		options.providerOverride || parsePiModelRef(defaultModel).provider;
	return new PiProvider({
		defaultModel,
		providerOverride,
		engine: options.engine,
	});
}
