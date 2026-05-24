import type {
	AssistantMessage,
	AssistantMessageEvent,
	Context,
	ImageContent,
	Message,
	StopReason,
	TextContent,
	ThinkingContent,
	Tool,
	ToolCall,
	ToolResultMessage,
	Usage,
	UserMessage,
} from "@earendil-works/pi-ai";

export type PiTextContent = TextContent;
export type PiThinkingContent = ThinkingContent;
export type PiImageContent = ImageContent;
export type PiToolCall = ToolCall;
export type PiStopReason = StopReason;
export type PiUsage = Usage;
export type PiUserMessage = UserMessage;
export type PiAssistantMessage = AssistantMessage;
export type PiToolResultMessage = ToolResultMessage;
export type PiMessage = Message;
export type PiTool = Tool;
export type PiContext = Context;
export type PiAssistantMessageEvent = AssistantMessageEvent;

export interface PiModelRef {
	provider: string;
	model: string;
}
