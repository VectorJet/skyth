import type { LoopEvent } from "./loop";
import type { ModelChatEvent } from "./model_chat";
import type { SendEvent } from "./send";
import type { ToolEvent } from "./tool";
import type { WarnEvent } from "./warn";

export type AgentEvent =
	| ModelChatEvent
	| ToolEvent
	| WarnEvent
	| LoopEvent
	| SendEvent;

export type AgentEventType = "model.chat" | "tool" | "warn" | "loop" | "send";

export interface AgentEventManifest {
	id: string;
	name: string;
	version: string;
	eventType: AgentEventType;
	capabilities: string[];
}

export const EVENT_MANIFESTS: AgentEventManifest[] = [
	{
		id: "skyth.event.model-chat",
		name: "ModelChatEvent",
		version: "1.0.0",
		eventType: "model.chat",
		capabilities: ["streaming", "final", "aborted", "error"],
	},
	{
		id: "skyth.event.tool",
		name: "ToolEvent",
		version: "1.0.0",
		eventType: "tool",
		capabilities: ["execute", "result", "error"],
	},
	{
		id: "skyth.event.warn",
		name: "WarnEvent",
		version: "1.0.0",
		eventType: "warn",
		capabilities: ["provider", "rate-limit", "tool", "context"],
	},
	{
		id: "skyth.event.loop",
		name: "LoopEvent",
		version: "1.0.0",
		eventType: "loop",
		capabilities: ["detected"],
	},
	{
		id: "skyth.event.send",
		name: "SendEvent",
		version: "1.0.0",
		eventType: "send",
		capabilities: ["outbound", "final"],
	},
];

export function getEventManifest(
	eventType: AgentEventType,
): AgentEventManifest | undefined {
	return EVENT_MANIFESTS.find((m) => m.eventType === eventType);
}

export function validateEventManifest(manifest: AgentEventManifest): boolean {
	return (
		typeof manifest.id === "string" &&
		typeof manifest.name === "string" &&
		typeof manifest.version === "string" &&
		typeof manifest.eventType === "string" &&
		Array.isArray(manifest.capabilities)
	);
}

export function getAllEventTypes(): AgentEventType[] {
	return EVENT_MANIFESTS.map((m) => m.eventType);
}

export * from "./loop";
export * from "./model_chat";
export * from "./send";
export * from "./tool";
export * from "./warn";
