declare module "@/bus/events" {
	export interface InboundMessage {
		channel: string;
		senderId: string;
		chatId: string;
		content: string;
		timestamp?: Date;
		media?: string[];
		metadata?: Record<string, any>;
	}
	export interface OutboundMessage {
		channel: string;
		chatId: string;
		content: string;
		replyTo?: string;
		media?: string[];
		metadata?: Record<string, any>;
	}
	export function sessionKey(msg: InboundMessage): string;
}

declare module "@/agents/../bus/events" {
	export * from "@/bus/events";
}

declare module "@/agents/generalist_agent/../../bus/events" {
	export * from "@/bus/events";
}

declare module "@/bus/queue" {
	import type { InboundMessage, OutboundMessage } from "@/bus/events";
	export class MessageBus {
		publishInbound(msg: InboundMessage): Promise<void>;
		publishOutbound(msg: OutboundMessage): Promise<void>;
		consumeInbound(): Promise<InboundMessage>;
		consumeOutbound(): Promise<OutboundMessage>;
		consumeInboundWithTimeout(
			timeoutMs: number,
		): Promise<InboundMessage | null>;
		consumeOutboundWithTimeout(
			timeoutMs: number,
		): Promise<OutboundMessage | null>;
		readonly inboundSize: number;
		readonly outboundSize: number;
	}
}

declare module "@/agents/../bus/queue" {
	export * from "@/bus/queue";
}

declare module "@/bus" {
	export const Bus: any;
}

declare module "@/file" {
	export const File: any;
}

declare module "@/file/watcher" {
	export const FileWatcher: any;
}

declare module "@/file/time" {
	export const FileTime: any;
}

declare module "@/file/ripgrep" {
	export const Ripgrep: any;
}

declare module "@/project/instance" {
	export const Instance: any;
}

declare module "@/patch" {
	export const Patch: any;
}

declare module "@/lsp" {
	export const LSP: any;
}

declare module "@/question" {
	export const Question: any;
}

declare module "@/session" {
	export const Session: any;
}

declare module "../session" {
	export const Session: any;
}

declare module "@/session/message-v2" {
	export namespace MessageV2 {
		type FilePart = any;
		type TextPart = any;
		type WithParts = any;
		type User = any;
		function stream(...args: any[]): AsyncIterable<any>;
		function get(...args: any[]): Promise<any>;
	}
	export const MessageV2: any;
}

declare module "@/session/prompt" {
	export const SessionPrompt: any;
}

declare module "@/session/instruction" {
	export const InstructionPrompt: any;
}

declare module "@/session/todo" {
	export const Todo: any;
}

declare module "@/provider/provider" {
	export const Provider: any;
}

declare module "@/config/config" {
	export const Config: any;
}

declare module "@/plugin" {
	export const Plugin: any;
}

declare module "@/flag/flag" {
	export const Flag: any;
}

declare module "@/flag/flag.ts" {
	export const Flag: any;
}

declare module "@/shell/shell" {
	export const Shell: any;
}

declare module "@/permission/arity" {
	export const BashArity: any;
}

declare module "@/skill" {
	export const Skill: any;
}

declare module "@/snapshot" {
	export const Snapshot: any;
}

declare module "@/util/defer" {
	export const defer: any;
}

declare module "@/util/iife" {
	export const iife: any;
}

declare module "@/util/lazy" {
	export const lazy: any;
}

declare module "@/util/log" {
	export const Log: any;
}

declare module "@/agent/agent" {
	export namespace Agent {
		interface Info {
			name: string;
			mode?: string;
			description?: string;
			model?: { modelID: string; providerID: string };
			permission?: any[];
		}
		function list(): Promise<Info[]>;
		function get(name: string): Promise<Info | undefined>;
	}
}

declare module "@opencode-ai/plugin" {
	export type ToolContext = any;
	export type ToolDefinition = any;
}
