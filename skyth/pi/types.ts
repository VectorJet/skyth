/**
 * Local mirror of the subset of `@earendil-works/pi-ai` contract types
 * Skyth's adapter layer depends on. Kept here so this module type-checks
 * without Pi installed as a dependency.
 *
 * When Pi is wired as a real dependency:
 *   - replace each declaration with `export type { X } from "@earendil-works/pi-ai";`
 *   - delete this file once nothing imports from `@/pi/types` anymore.
 */

export interface PiTextContent {
	type: "text";
	text: string;
	textSignature?: string;
}

export interface PiThinkingContent {
	type: "thinking";
	thinking: string;
	thinkingSignature?: string;
	redacted?: boolean;
}

export interface PiImageContent {
	type: "image";
	data: string;
	mimeType: string;
}

export interface PiToolCall {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	thoughtSignature?: string;
}

export type PiStopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

export interface PiUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
}

export interface PiUserMessage {
	role: "user";
	content: string | (PiTextContent | PiImageContent)[];
	timestamp: number;
}

export interface PiAssistantMessage {
	role: "assistant";
	content: (PiTextContent | PiThinkingContent | PiToolCall)[];
	api: string;
	provider: string;
	model: string;
	responseModel?: string;
	responseId?: string;
	usage: PiUsage;
	stopReason: PiStopReason;
	errorMessage?: string;
	timestamp: number;
}

export interface PiToolResultMessage {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: (PiTextContent | PiImageContent)[];
	isError: boolean;
	timestamp: number;
}

export type PiMessage =
	| PiUserMessage
	| PiAssistantMessage
	| PiToolResultMessage;

/**
 * Pi tools use TypeBox `TSchema` for parameters at compile time. At runtime
 * the field is a JSON-Schema-like object, which is structurally compatible
 * with Skyth's existing tool parameter shape, so we mirror it as `unknown`.
 */
export interface PiTool {
	name: string;
	description: string;
	parameters: unknown;
}

export interface PiContext {
	systemPrompt?: string;
	messages: PiMessage[];
	tools?: PiTool[];
}

export type PiAssistantMessageEvent =
	| { type: "start"; partial: PiAssistantMessage }
	| { type: "text_start"; contentIndex: number; partial: PiAssistantMessage }
	| {
			type: "text_delta";
			contentIndex: number;
			delta: string;
			partial: PiAssistantMessage;
	  }
	| {
			type: "text_end";
			contentIndex: number;
			content: string;
			partial: PiAssistantMessage;
	  }
	| {
			type: "thinking_start";
			contentIndex: number;
			partial: PiAssistantMessage;
	  }
	| {
			type: "thinking_delta";
			contentIndex: number;
			delta: string;
			partial: PiAssistantMessage;
	  }
	| {
			type: "thinking_end";
			contentIndex: number;
			content: string;
			partial: PiAssistantMessage;
	  }
	| {
			type: "toolcall_start";
			contentIndex: number;
			partial: PiAssistantMessage;
	  }
	| {
			type: "toolcall_delta";
			contentIndex: number;
			delta: string;
			partial: PiAssistantMessage;
	  }
	| {
			type: "toolcall_end";
			contentIndex: number;
			toolCall: PiToolCall;
			partial: PiAssistantMessage;
	  }
	| {
			type: "done";
			reason: Extract<PiStopReason, "stop" | "length" | "toolUse">;
			message: PiAssistantMessage;
	  }
	| {
			type: "error";
			reason: Extract<PiStopReason, "aborted" | "error">;
			error: PiAssistantMessage;
	  };

export interface PiModelRef {
	provider: string;
	model: string;
}
