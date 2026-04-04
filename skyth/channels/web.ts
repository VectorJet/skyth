import type { OutboundMessage } from "@/bus/events";
import type { MessageBus } from "@/bus/queue";
import { BaseChannel } from "@/channels/base";

export class WebChannel extends BaseChannel {
	override readonly name = "web";
	private broadcastFn?: (event: string, payload?: any) => void;
	private textBuffers = new Map<string, string>();
	private reasoningBuffers = new Map<string, string>();
	private deltaSentAt = new Map<
		string,
		{ text?: number; reasoning?: number }
	>();
	private deltaLastBroadcastLen = new Map<
		string,
		{ text?: number; reasoning?: number }
	>();
	private abortedRuns = new Map<string, number>();

	constructor(config: any, bus: MessageBus) {
		super(config, bus);
	}

	setBroadcastFn(fn: (event: string, payload?: any) => void): void {
		this.broadcastFn = fn;
	}

	async start(): Promise<void> {
		this.running = true;
	}

	async stop(): Promise<void> {
		this.running = false;
	}

	private resolveMergedAssistantText(
		previousText: string,
		nextText: string,
		nextDelta: string,
	): string {
		if (nextText && previousText) {
			if (nextText.startsWith(previousText)) return nextText;
			if (previousText.startsWith(nextText) && !nextDelta) return previousText;
		}
		if (nextDelta) return previousText + nextDelta;
		if (nextText) return nextText;
		return previousText;
	}

	streamFinal(
		chatId: string,
		event: {
			text?: string;
			stopReason?: string;
			errorMessage?: string;
		},
	): void {
		const text = event.text ?? "";
		const seq = Date.now();
		if (this.broadcastFn) {
			this.broadcastFn("chat.final", {
				channel: this.name,
				chatId,
				state: "final",
				message: {
					role: "assistant",
					content: [{ type: "text", text }],
					timestamp: seq,
				},
				...(event.stopReason && { stopReason: event.stopReason }),
				...(event.errorMessage && { errorMessage: event.errorMessage }),
				timestamp: new Date().toISOString(),
			});
		}
		this.textBuffers.delete(chatId);
		this.reasoningBuffers.delete(chatId);
		this.deltaSentAt.delete(chatId);
		this.deltaLastBroadcastLen.delete(chatId);
		this.abortedRuns.delete(chatId);
	}

	streamReset(chatId: string): void {
		this.textBuffers.delete(chatId);
		this.reasoningBuffers.delete(chatId);
		this.deltaSentAt.delete(chatId);
		this.deltaLastBroadcastLen.delete(chatId);
	}

	streamDelta(
		chatId: string,
		event: {
			type: string;
			text?: string;
			toolCallId?: string;
			toolName?: string;
			args?: string;
			result?: any;
		},
	): void {
		if (event.type === "text-delta" || event.type === "reasoning-delta") {
			const lane = event.type === "reasoning-delta" ? "reasoning" : "text";
			const now = Date.now();
			const last = this.deltaSentAt.get(chatId)?.[lane] ?? 0;
			if (now - last < 150) {
				return;
			}

			const buffers =
				lane === "reasoning" ? this.reasoningBuffers : this.textBuffers;
			const previousText = buffers.get(chatId) ?? "";
			const mergedText = this.resolveMergedAssistantText(
				previousText,
				"",
				event.text ?? "",
			);

			const lastBroadcastLen =
				this.deltaLastBroadcastLen.get(chatId)?.[lane] ?? 0;
			if (!mergedText || mergedText.length <= lastBroadcastLen) {
				return;
			}

			buffers.set(chatId, mergedText);
			this.deltaSentAt.set(chatId, {
				...(this.deltaSentAt.get(chatId) ?? {}),
				[lane]: now,
			});
			this.deltaLastBroadcastLen.set(chatId, {
				...(this.deltaLastBroadcastLen.get(chatId) ?? {}),
				[lane]: mergedText.length,
			});

			if (this.broadcastFn) {
				this.broadcastFn("chat.stream", {
					channel: this.name,
					chatId,
					type: event.type,
					message: {
						role: "assistant",
						content: [{ type: "text", text: mergedText }],
						timestamp: now,
					},
					timestamp: new Date().toISOString(),
				});
			}
		} else {
			if (this.broadcastFn) {
				this.broadcastFn("chat.stream", {
					channel: this.name,
					chatId,
					...event,
					timestamp: new Date().toISOString(),
				});
			}
		}
	}

	async send(msg: OutboundMessage): Promise<void> {
		if (this.broadcastFn) {
			this.broadcastFn("chat.message", {
				channel: this.name,
				chatId: msg.chatId,
				content: msg.content,
				metadata: msg.metadata,
				timestamp: new Date().toISOString(),
			});
		}
	}
}
