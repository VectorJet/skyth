/**
 * Pi-backed `LLMProvider` adapter.
 *
 * Holds all conversion + credential plumbing for a Pi turn. The actual call
 * into `@earendil-works/pi-ai` is injected as a `PiStreamEngine` so this
 * module type-checks today without Pi installed. Wiring Pi at runtime is a
 * one-line change in `skyth/pi/factory.ts`.
 *
 * The `chat()` method is intentionally inert until an engine is supplied so a
 * gateway boot that accidentally selects Pi fails loudly with an actionable
 * error rather than silently falling back.
 */

import { LLMProvider } from "@/providers/base";
import type { LLMResponse, StreamCallback } from "@/providers/base";
import { fromPiAssistantResponse, fromPiStreamEvent } from "@/pi/events";
import { toPiContext } from "@/pi/messages";
import { parsePiModelRef } from "@/pi/model";
import { toPiTools } from "@/pi/tools";
import { buildPiStreamCredentials } from "@/pi/credentials";
import type {
	PiAssistantMessage,
	PiAssistantMessageEvent,
	PiContext,
	PiStopReason,
	PiTool,
} from "@/pi/types";

export interface PiStreamRequest {
	provider: string;
	model: string;
	context: PiContext;
	tools?: PiTool[];
	apiKey?: string;
	apiBase?: string;
	headers?: Record<string, string>;
	temperature?: number;
	maxTokens?: number;
	signal?: AbortSignal;
	onEvent?: (event: PiAssistantMessageEvent) => void;
}

export interface PiStreamResult {
	message: PiAssistantMessage;
	stopReason: PiStopReason;
}

/**
 * Engine boundary that hides the actual Pi SDK from Skyth core. A real
 * engine wraps `getModel(provider, model)` + `streamSimple(model, context,
 * options)` from `@earendil-works/pi-ai`.
 */
export type PiStreamEngine = (request: PiStreamRequest) => Promise<PiStreamResult>;

export interface PiProviderParams {
	defaultModel: string;
	providerOverride?: string;
	engine?: PiStreamEngine;
}

export class PiProvider extends LLMProvider {
	private readonly defaultModel: string;
	private readonly providerOverride?: string;
	private readonly engine?: PiStreamEngine;

	constructor(params: PiProviderParams) {
		super();
		this.defaultModel = params.defaultModel;
		this.providerOverride = params.providerOverride;
		this.engine = params.engine;
	}

	override getDefaultModel(): string {
		return this.defaultModel;
	}

	override async chat(params: {
		messages: Array<Record<string, any>>;
		tools?: Array<Record<string, any>>;
		model?: string;
		max_tokens?: number;
		temperature?: number;
		stream?: boolean;
		onStream?: StreamCallback;
	}): Promise<LLMResponse> {
		if (!this.engine) {
			throw new Error(
				"PiProvider has no stream engine wired. Install " +
					"`@earendil-works/pi-ai` and inject an engine via " +
					"`createPiProvider({ ..., engine })`.",
			);
		}

		const modelRef = params.model ?? this.defaultModel;
		const parsed = parsePiModelRef(modelRef);
		const provider = this.providerOverride
			? this.providerOverride
			: parsed.provider;
		const context = toPiContext(params.messages);
		if (params.tools?.length) context.tools = toPiTools(params.tools);

		const credentials = buildPiStreamCredentials(provider);

		const { message, stopReason } = await this.engine({
			provider,
			model: parsed.model,
			context,
			tools: context.tools,
			apiKey: credentials.apiKey,
			apiBase: credentials.apiBase,
			headers: credentials.headers,
			temperature: params.temperature,
			maxTokens: params.max_tokens,
			onEvent: params.onStream
				? (event) => {
						const streamEvent = fromPiStreamEvent(event);
						if (streamEvent) params.onStream?.(streamEvent);
					}
				: undefined,
		});

		return fromPiAssistantResponse(message, stopReason);
	}
}
