import type { ModelMessage } from "ai";
import type { ModelSDKInfo } from "@/pi/catalog";
import { stripToolHistoryForProvider } from "@/providers/ai_sdk_provider_tools";

export interface ProviderTransformModel {
	providerID: string;
	modelID: string;
	info?: ModelSDKInfo;
}

export interface ProviderRequestOptions {
	temperature?: number;
	topP?: number;
	topK?: number;
	tools?: Record<string, unknown>;
}

function lowerModel(model: ProviderTransformModel): string {
	return `${model.providerID}/${model.modelID}`.toLowerCase();
}

function scrubToolCallId(id: string, providerID: string): string {
	if (providerID === "mistral" || providerID.includes("mistral")) {
		return id
			.replace(/[^a-zA-Z0-9]/g, "")
			.slice(0, 9)
			.padEnd(9, "0");
	}
	if (lowerModel({ providerID, modelID: id }).includes("claude")) {
		return id.replace(/[^a-zA-Z0-9_-]/g, "_");
	}
	return id;
}

function sanitizeText(text: string): string {
	return text.replace(
		/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
		"\uFFFD",
	);
}

function sanitizeMessages(messages: ModelMessage[]): ModelMessage[] {
	return messages.map((message) => {
		if (typeof message.content === "string") {
			return {
				...message,
				content: sanitizeText(message.content),
			} as ModelMessage;
		}
		if (!Array.isArray(message.content)) return message;
		return {
			...message,
			content: message.content.map((part) => {
				if (
					typeof part === "object" &&
					part &&
					"type" in part &&
					(part.type === "text" || part.type === "reasoning") &&
					"text" in part &&
					typeof part.text === "string"
				) {
					return { ...part, text: sanitizeText(part.text) };
				}
				return part;
			}),
		} as ModelMessage;
	});
}

function normalizeAnthropicMessages(messages: ModelMessage[]): ModelMessage[] {
	return messages
		.map((message) => {
			if (typeof message.content === "string") {
				return message.content === "" ? undefined : message;
			}
			if (!Array.isArray(message.content)) return message;
			const content = message.content.filter((part) => {
				if (
					typeof part === "object" &&
					part &&
					"type" in part &&
					(part.type === "text" || part.type === "reasoning")
				) {
					return String((part as { text?: unknown }).text ?? "").length > 0;
				}
				return true;
			});
			return content.length
				? ({ ...message, content } as ModelMessage)
				: undefined;
		})
		.filter((message): message is ModelMessage => Boolean(message));
}

function scrubToolIds(
	messages: ModelMessage[],
	model: ProviderTransformModel,
): ModelMessage[] {
	return messages.map((message) => {
		if (!Array.isArray(message.content)) return message;
		return {
			...message,
			content: message.content.map((part) => {
				if (
					typeof part === "object" &&
					part &&
					"type" in part &&
					(part.type === "tool-call" || part.type === "tool-result") &&
					"toolCallId" in part &&
					typeof part.toolCallId === "string"
				) {
					return {
						...part,
						toolCallId: scrubToolCallId(part.toolCallId, model.providerID),
					};
				}
				return part;
			}),
		} as ModelMessage;
	});
}

function addDeepSeekReasoning(messages: ModelMessage[]): ModelMessage[] {
	return messages.map((message) => {
		if (message.role !== "assistant") return message;
		if (Array.isArray(message.content)) {
			if (
				message.content.some(
					(part) =>
						typeof part === "object" &&
						part &&
						"type" in part &&
						part.type === "reasoning",
				)
			) {
				return message;
			}
			return {
				...message,
				content: [...message.content, { type: "reasoning", text: "" }],
			} as ModelMessage;
		}
		const text = typeof message.content === "string" ? message.content : "";
		return {
			...message,
			content: [
				...(text ? [{ type: "text" as const, text }] : []),
				{ type: "reasoning" as const, text: "" },
			],
		} as ModelMessage;
	});
}

export function transformMessagesForProvider(
	messages: ModelMessage[],
	model: ProviderTransformModel,
): ModelMessage[] {
	let result = sanitizeMessages(messages);
	const id = lowerModel(model);
	const npm = model.info?.npm ?? "";

	if (
		model.providerID === "google" ||
		npm === "@ai-sdk/google" ||
		id.includes("gemini")
	) {
		result = stripToolHistoryForProvider(result);
	}
	if (npm === "@ai-sdk/anthropic" || id.includes("claude")) {
		result = normalizeAnthropicMessages(result);
		result = scrubToolIds(result, model);
	}
	if (
		model.providerID === "mistral" ||
		id.includes("mistral") ||
		id.includes("devstral")
	) {
		result = scrubToolIds(result, model);
	}
	if (id.includes("deepseek")) {
		result = addDeepSeekReasoning(result);
	}

	return result;
}

export function transformRequestOptions(
	model: ProviderTransformModel,
	input: ProviderRequestOptions,
): ProviderRequestOptions {
	const id = lowerModel(model);
	const output: ProviderRequestOptions = { ...input };

	if (model.info?.toolCall === false) output.tools = undefined;
	if (model.info?.temperature === false) output.temperature = undefined;

	if (output.temperature === undefined && model.info?.temperature !== false) {
		if (id.includes("gemini")) output.temperature = 1;
		else if (id.includes("minimax-m2")) output.temperature = 1;
		else if (id.includes("kimi-k2.5") || id.includes("kimi-k2p5")) {
			output.temperature = 1;
		} else if (id.includes("kimi-k2")) {
			output.temperature = 0.6;
		} else if (id.includes("qwen")) {
			output.temperature = 0.55;
		}
	}

	if (output.topP === undefined) {
		if (
			id.includes("minimax-m2") ||
			id.includes("gemini") ||
			id.includes("kimi-k2.5") ||
			id.includes("kimi-k2p5")
		) {
			output.topP = 0.95;
		} else if (id.includes("qwen")) {
			output.topP = 1;
		}
	}

	if (output.topK === undefined) {
		if (id.includes("gemini")) output.topK = 64;
		else if (id.includes("minimax-m2")) output.topK = 40;
	}

	return output;
}
