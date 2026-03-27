import type { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { eventLine } from "@/logging/events";
import { BaseChannel } from "@/channels/base";
import {
	extractPairingCode,
	isCommand,
	isPairingPayload,
} from "@/channels/telegram/helpers";
import { renderTelegramMarkdown } from "@/channels/telegram/markdown";

export { renderTelegramMarkdown } from "@/channels/telegram/markdown";

interface TelegramUpdate {
	update_id: number;
	message?: {
		message_id: number;
		text?: string;
		caption?: string;
		from?: { id?: number | string };
		chat?: { id?: number | string };
	};
}

export class TelegramChannel extends BaseChannel {
	override readonly name = "telegram";
	private offset = 0;
	private pollTask?: Promise<void>;
	private readonly typingTimers = new Map<
		string,
		ReturnType<typeof setInterval>
	>();
	private readonly typingStartedAt = new Map<string, number>();
	private pairingEndpoint: string | null = null;

	constructor(config: any, bus: MessageBus) {
		super(config, bus);
	}

	setPairingEndpoint(url: string | null): void {
		this.pairingEndpoint = url;
	}

	private apiUrl(method: string): string {
		return `https://api.telegram.org/bot${this.config.token}/${method}`;
	}

	private async api(
		method: string,
		payload?: Record<string, any>,
	): Promise<any> {
		const response = await fetch(this.apiUrl(method), {
			method: payload ? "POST" : "GET",
			headers: payload ? { "Content-Type": "application/json" } : undefined,
			body: payload ? JSON.stringify(payload) : undefined,
		});
		const json = (await response.json()) as {
			ok?: boolean;
			description?: string;
			result?: unknown;
		};
		if (!response.ok || !json.ok) {
			const desc = json.description ? `: ${json.description}` : "";
			throw new Error(`Telegram API ${method} failed${desc}`);
		}
		return json.result;
	}

	private async pollLoop(): Promise<void> {
		while (this.running) {
			try {
				const updates = (await this.api("getUpdates", {
					offset: this.offset,
					timeout: 25,
					allowed_updates: ["message"],
				})) as TelegramUpdate[];
				if (updates.length) {
					console.log(
						eventLine(
							"event",
							"telegram",
							"receive",
							`${String(updates.length)} update`,
						),
					);
				}

				for (const update of updates) {
					this.offset = Math.max(this.offset, update.update_id + 1);
					const message = update.message;
					if (!message) continue;
					const senderId = message.from?.id;
					const chatId = message.chat?.id;
					const content = message.text ?? message.caption ?? "";
					if (senderId === undefined || chatId === undefined || !content.trim())
						continue;
					const pairingCode = extractPairingCode(content);
					if (pairingCode && this.pairingEndpoint) {
						await this.forwardPairingCode(
							pairingCode,
							String(senderId),
							String(chatId),
						);
						continue;
					}
					if (isPairingPayload(content)) {
						console.log(eventLine("event", "telegram", "drop", "pairing"));
						continue;
					}
					if (await this.handleBuiltinCommand(message, String(chatId))) {
						continue;
					}
					if (!this.isAllowed(String(senderId))) {
						console.error(eventLine("event", "telegram", "block", "allowlist"));
						continue;
					}
					this.startTyping(String(chatId));
					await this.handleMessage(
						String(senderId),
						String(chatId),
						content,
						[],
						{
							message_id: message.message_id,
						},
					);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(
					eventLine("event", "telegram", "error", `poll ${message}`),
				);
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}
	}

	async start(): Promise<void> {
		if (!this.config.token) {
			throw new Error("telegram token is required");
		}
		const me = await this.api("getMe");
		console.log(
			eventLine(
				"event",
				"telegram",
				"status",
				`auth ${String(me?.username ?? "ok")}`,
			),
		);
		this.running = true;
		this.pollTask = this.pollLoop();
	}

	async stop(): Promise<void> {
		this.running = false;
		for (const chatId of [...this.typingTimers.keys()]) this.stopTyping(chatId);
		if (this.pollTask) await this.pollTask.catch(() => undefined);
	}

	async send(msg: OutboundMessage): Promise<void> {
		if (!this.running) return;
		this.stopTyping(msg.chatId);
		const payload: Record<string, any> = {
			chat_id: msg.chatId,
			text: renderTelegramMarkdown(msg.content),
			parse_mode: "HTML",
			disable_web_page_preview: true,
		};
		if (msg.replyTo) {
			const n = Number(msg.replyTo);
			if (Number.isInteger(n) && n > 0) payload.reply_to_message_id = n;
		}
		try {
			await this.api("sendMessage", payload);
		} catch (error) {
			const fallback: Record<string, any> = {
				chat_id: msg.chatId,
				text: msg.content,
				disable_web_page_preview: true,
			};
			if (msg.replyTo)
				fallback.reply_to_message_id = payload.reply_to_message_id;
			await this.api("sendMessage", fallback);
			const detail = error instanceof Error ? error.message : String(error);
			console.error(eventLine("event", "telegram", "warn", `md ${detail}`));
		}
		console.log(eventLine("event", "telegram", "send", msg.content));
	}

	private async handleBuiltinCommand(
		message: NonNullable<TelegramUpdate["message"]>,
		chatId: string,
	): Promise<boolean> {
		const text = (message.text ?? "").trim();
		if (!text) return false;

		if (isCommand(text, "start")) {
			await this.api("sendMessage", {
				chat_id: chatId,
				text: "Hi. I am skyth.\n\nSend me a message and I will respond.\nType /help to see available commands.",
				reply_to_message_id: message.message_id,
			});
			return true;
		}

		if (isCommand(text, "help")) {
			await this.api("sendMessage", {
				chat_id: chatId,
				text: "skyth commands:\n/new - Start a new conversation\n/help - Show available commands",
				reply_to_message_id: message.message_id,
			});
			return true;
		}

		return false;
	}

	private startTyping(chatId: string): void {
		this.stopTyping(chatId);
		this.typingStartedAt.set(chatId, Date.now());

		const tick = async (): Promise<void> => {
			if (!this.running) return;
			const startedAt = this.typingStartedAt.get(chatId) ?? 0;
			if (Date.now() - startedAt > 120_000) {
				this.stopTyping(chatId);
				return;
			}
			try {
				await this.api("sendChatAction", { chat_id: chatId, action: "typing" });
			} catch {
				// best effort
			}
		};

		void tick();
		const timer = setInterval(() => {
			void tick();
		}, 4_000);
		this.typingTimers.set(chatId, timer);
	}

	private stopTyping(chatId: string): void {
		const timer = this.typingTimers.get(chatId);
		if (timer) clearInterval(timer);
		this.typingTimers.delete(chatId);
		this.typingStartedAt.delete(chatId);
	}

	private async forwardPairingCode(
		code: string,
		senderId: string,
		chatId: string,
	): Promise<void> {
		if (!this.pairingEndpoint) return;
		try {
			const response = await fetch(`${this.pairingEndpoint}/pair`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					code,
					senderId,
					metadata: { platform: "telegram" },
				}),
			});
			const result = (await response.json()) as {
				success: boolean;
				error?: string;
			};
			if (result.success) {
				console.log(eventLine("event", "telegram", "pair", "success"));
				await this.api("sendMessage", {
					chat_id: chatId,
					text: "Pairing successful! Your device has been linked.",
				});
			} else {
				console.error(
					eventLine("event", "telegram", "pair", `failed: ${result.error}`),
				);
				await this.api("sendMessage", {
					chat_id: chatId,
					text: `Pairing failed: ${result.error}`,
				});
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				eventLine("event", "telegram", "pair", `error: ${message}`),
			);
		}
	}
}
