/**
 * Construct a `PiProvider` from current Skyth config. Mirrors the contract
 * of `makeProviderFromConfig` in `cli/runtime/helpers/providers` so the
 * gateway boot path can swap providers in one place.
 */

import { loadConfig } from "@/config/loader";
import { PiProvider, type PiStreamEngine } from "@/pi/provider";
import { parsePiModelRef } from "@/pi/model";
import {
	getModel,
	streamSimple,
	type Api,
	type KnownProvider,
	type Model,
} from "@earendil-works/pi-ai";

export interface CreatePiProviderOptions {
	modelOverride?: string;
	providerOverride?: string;
	apiKey?: string;
	apiBase?: string;
	headers?: Record<string, string>;
	engine?: PiStreamEngine;
}

export const piStreamSimpleEngine: PiStreamEngine = async (request) => {
	const registeredModel = getModel(
		request.provider as KnownProvider,
		request.model as never,
	) as Model<Api>;
	const baseModel =
		registeredModel ??
		(request.provider === "faux"
			? ({
					id: request.model,
					name: request.model,
					api: "faux",
					provider: "faux",
					baseUrl: "http://localhost:0",
					reasoning: false,
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 128000,
					maxTokens: 16384,
				} as Model<Api>)
			: undefined);
	if (!baseModel) {
		throw new Error(
			`Pi model not found for provider '${request.provider}' and model '${request.model}'.`,
		);
	}
	const model = request.apiBase
		? ({ ...baseModel, baseUrl: request.apiBase } as Model<Api>)
		: baseModel;
	const stream = streamSimple(model, request.context, {
		apiKey: request.apiKey,
		headers: request.headers,
		temperature: request.temperature,
		maxTokens: request.maxTokens,
		signal: request.signal,
	});

	for await (const event of stream) {
		request.onEvent?.(event);
	}

	const message = await stream.result();
	return { message, stopReason: message.stopReason };
};

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
		apiKey: options.apiKey,
		apiBase: options.apiBase,
		headers: options.headers,
		engine: options.engine ?? piStreamSimpleEngine,
	});
}
