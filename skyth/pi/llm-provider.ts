export interface ToolCallRequest {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	providerOptions?: Record<string, unknown>;
}

export interface LLMResponse {
	content: string | null;
	tool_calls: ToolCallRequest[];
	finish_reason: string;
	usage?: Record<string, number>;
	reasoning_content?: string | null;
}

export type StreamEvent =
	| { type: "text-delta"; text: string }
	| { type: "reasoning-delta"; text: string }
	| { type: "tool-call"; toolCallId: string; toolName: string; args: string }
	| { type: "tool-result"; toolCallId: string; result: unknown }
	| { type: "done"; response: LLMResponse }
	| { type: "reset" };

export type StreamCallback = (event: StreamEvent) => void;

export abstract class LLMProvider {
	protected readonly apiKey?: string;
	protected readonly apiBase?: string;

	constructor(apiKey?: string, apiBase?: string) {
		this.apiKey = apiKey;
		this.apiBase = apiBase;
	}

	static sanitizeEmptyContent(
		messages: Array<Record<string, unknown>>,
	): Array<Record<string, unknown>> {
		return messages.map((msg) => {
			const content = msg.content;
			if (typeof content === "string" && content.length === 0) {
				return {
					...msg,
					content:
						msg.role === "assistant" && msg.tool_calls ? null : "(empty)",
				};
			}
			return msg;
		});
	}

	abstract chat(params: {
		messages: Array<Record<string, unknown>>;
		tools?: Array<Record<string, unknown>>;
		model?: string;
		max_tokens?: number;
		temperature?: number;
		stream?: boolean;
		onStream?: StreamCallback;
	}): Promise<LLMResponse>;

	abstract getDefaultModel(): string;
}
