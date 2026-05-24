import {
	completeSimple,
	getModel,
	type Api,
	type KnownProvider,
	type Model,
} from "@earendil-works/pi-ai";
import type { LLMResponse } from "@/pi/llm-provider";
import { buildPiStreamCredentials } from "@/pi/credentials";
import { fromPiAssistantResponse } from "@/pi/events";
import { toPiContext } from "@/pi/messages";
import { parsePiModelRef } from "@/pi/model";

export interface PiCompletionRequest {
	messages: Array<Record<string, unknown>>;
	model?: string;
	temperature?: number;
	maxTokens?: number;
	apiKey?: string;
	apiBase?: string;
	headers?: Record<string, string>;
}

export interface PiTextCompletionClient {
	completeText(request: PiCompletionRequest): Promise<LLMResponse>;
}

export async function completePiText(
	request: PiCompletionRequest,
): Promise<LLMResponse> {
	const modelRef = request.model || "openai/gpt-5-mini";
	const parsed = parsePiModelRef(modelRef);
	const baseModel = getModel(
		parsed.provider as KnownProvider,
		parsed.model as never,
	) as Model<Api>;
	const model = request.apiBase
		? ({ ...baseModel, baseUrl: request.apiBase } as Model<Api>)
		: baseModel;
	const credentials = buildPiStreamCredentials(parsed.provider);
	const headers =
		request.headers || credentials.headers
			? { ...(credentials.headers ?? {}), ...(request.headers ?? {}) }
			: undefined;
	const message = await completeSimple(model, toPiContext(request.messages), {
		apiKey: request.apiKey ?? credentials.apiKey,
		headers,
		temperature: request.temperature,
		maxTokens: request.maxTokens,
	});
	return fromPiAssistantResponse(message, message.stopReason);
}

export function createPiCompletionClient(
	defaultModel?: string,
): PiTextCompletionClient {
	return {
		completeText(request) {
			return completePiText({
				...request,
				model: request.model ?? defaultModel,
			});
		},
	};
}
