/**
 * TelegramChannel: minimal Bot API client using long-polling getUpdates.
 *
 * - Bot token from env: TELEGRAM_BOT_TOKEN.
 * - Slash commands are registered programmatically via setMyCommands; no
 *   BotFather UI involved. Add a new command by dropping a file under
 *   commands/ and the loader picks it up at startup.
 * - Reactions via setMessageReaction (Telegram Bot API 7.0+).
 * - Files via sendDocument / sendPhoto.
 *
 * This is intentionally dependency-free (uses fetch + FormData) so it works
 * inside Bun without extra installs.
 */
import { readFile } from "fs/promises";
import { basename } from "path";
import type {
	Channel,
	ChannelCapabilities,
	IncomingHandler,
	IncomingMessage,
	SendOpts,
	SlashCommand,
} from "@/gateway/channels/types.ts";
import { stripGatewayPrefix } from "@/gateway/channels/format.ts";
import { rateLimiter } from "@/gateway/channels/rate-limit.ts";

const TG_BASE = "https://api.telegram.org";
const POLL_TIMEOUT_S = 25;

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function markdownToHtml(text: string): string {
	const lines = text.split("\n");
	let html = "";
	let inBlockquote = false;
	let inTable = false;
	let tableBuffer = "";

	for (const line of lines) {
		const l = line.trim();

		// Handle Tables
		if (l.startsWith("|") && l.endsWith("|")) {
			if (!inTable) {
				inTable = true;
				tableBuffer = "";
			}
			tableBuffer += line + "\n";
			continue;
		} else if (inTable) {
			html += `<pre>${escapeHtml(tableBuffer)}</pre>\n`;
			inTable = false;
		}

		if (l.startsWith("> ")) {
			if (!inBlockquote) {
				html += "<blockquote>";
				inBlockquote = true;
			}
			html += escapeHtml(l.slice(2)) + "\n";
			continue;
		} else if (inBlockquote) {
			html += "</blockquote>\n";
			inBlockquote = false;
		}

		// Horizontal Rule
		if (l === "---" || l === "***" || l === "___") {
			html += "────────────────────\n";
			continue;
		}

		if (l.startsWith("# ")) {
			html += `<b>${escapeHtml(l.slice(2))}</b>\n`;
		} else if (l.startsWith("## ")) {
			html += `<b>${escapeHtml(l.slice(3))}</b>\n`;
		} else if (l.startsWith("### ")) {
			html += `<b>${escapeHtml(l.slice(4))}</b>\n`;
		} else if (l.startsWith("#### ")) {
			html += `<b>${escapeHtml(l.slice(5))}</b>\n`;
		} else if (l.startsWith("- ") || l.startsWith("* ")) {
			html += `• ${escapeHtml(l.slice(2))}\n`;
		} else if (/^\d+\.\s/.test(l)) {
			html += escapeHtml(line) + "\n";
		} else {
			html += escapeHtml(line) + "\n";
		}
	}

	if (inTable) {
		html += `<pre>${escapeHtml(tableBuffer)}</pre>\n`;
	}
	if (inBlockquote) {
		html += "</blockquote>\n";
	}

	// 2. Code blocks (strip language tag)
	html = html.replace(/```([a-z0-9+#]*)?\n?([\s\S]+?)```/g, "<pre>$2</pre>");

	// 3. Inline formatting

	// Links [text](url)
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

	// Bold **text**
	html = html.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

	// Strikethrough ~~text~~
	html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>");

	// Italic *text* or _text_
	html = html.replace(/\*([^*]+)\*/g, "<i>$1</i>");
	html = html.replace(/_([^_]+)_/g, "<i>$1</i>");

	// Inline code `text`
	html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

	return html;
}

export class TelegramChannel implements Channel {
	readonly name = "telegram";
	readonly capabilities: ChannelCapabilities = {
		reactions: true,
		files: true,
		markdown: "v2",
		maxTextBytes: 4000,
	};

	private token: string;
	private offset = 0;
	private polling = false;
	private handlers: IncomingHandler[] = [];
	private commands = new Map<string, SlashCommand>();
	private aborter?: AbortController;

	constructor(token = process.env.TELEGRAM_BOT_TOKEN ?? "") {
		this.token = token;
	}

	private url(method: string) {
		return `${TG_BASE}/bot${this.token}/${method}`;
	}

	async start(): Promise<void> {
		if (!this.token) {
			console.warn("[telegram] TELEGRAM_BOT_TOKEN not set; channel inactive");
			return;
		}
		// The CEF Rust app handles polling when bridged.
		await this.publishCommands();

		if (process.env.CLAUDE_GATEWAY_TELEGRAM_POLLING === "0") {
			console.log("[telegram] polling disabled by env (bridged mode)");
			return;
		}
		this.polling = true;
		void this.pollLoop();
	}

	async stop(): Promise<void> {
		this.polling = false;
		this.aborter?.abort();
	}

	onIncoming(handler: IncomingHandler): void {
		this.handlers.push(handler);
	}

	registerCommand(cmd: SlashCommand): void {
		this.commands.set(cmd.name, cmd);
	}

	listCommands(): SlashCommand[] {
		return Array.from(this.commands.values());
	}

	/** Push the current command set to Telegram so the / menu shows them. */
	async publishCommands(): Promise<void> {
		if (!this.token) return;
		const commands = Array.from(this.commands.values()).map((c) => ({
			command: c.name,
			description: c.description.slice(0, 256),
		}));
		if (commands.length === 0) return;
		try {
			await fetch(this.url("setMyCommands"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ commands }),
			});
		} catch (err) {
			console.warn("[telegram] setMyCommands failed:", err);
		}
	}

	async send(
		chatId: string,
		text: string,
		_opts: SendOpts = {},
	): Promise<void> {
		if (process.env.CLAUDE_GATEWAY_TELEGRAM_POLLING === "0") {
			this.relayToRust({ type: "telegram-send", chatId, text });
			return;
		}
		if (!this.token) return;
		// Render the [GATEWAY] prefix as a leading 🤖 to humans, but keep it in
		// the captured payload Claude saw.
		const human = stripGatewayPrefix(text);
		const body = {
			chat_id: chatId,
			text: markdownToHtml(human).slice(0, this.capabilities.maxTextBytes),
			parse_mode: "HTML",
		};
		await this.postWithBackoff("sendMessage", body, chatId);
	}

	private relayToRust(payload: any) {
		const rt = (globalThis as any).runtime;
		if (rt) {
			const web = rt.channelManager.get("web");
			if (web && (web as any).ws?.readyState === 1) {
				(web as any).ws.send(JSON.stringify(payload));
				return;
			}
		}
		console.warn("[telegram] bridge unavailable; dropping outgoing message");
	}

	/**
	 * POST a JSON body to the Bot API and honor HTTP 429
	 * (`parameters.retry_after`). Each retry doubles the backoff up to a cap;
	 * we also penalize the per-chat rate-limiter bucket so the next send waits.
	 */
	private async postWithBackoff(
		method: string,
		body: Record<string, unknown>,
		chatId: string,
		maxRetries = 4,
	): Promise<void> {
		let attempt = 0;
		let extraDelay = 0;
		while (attempt <= maxRetries) {
			try {
				if (extraDelay > 0) {
					await new Promise((r) => setTimeout(r, extraDelay));
				}
				const res = await fetch(this.url(method), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				});
				if (res.status === 429) {
					const json: any = await res.json().catch(() => ({}));
					const retryAfter = Number(json?.parameters?.retry_after ?? 1);
					rateLimiter.penalize("telegram", chatId, retryAfter);
					extraDelay = Math.min(60_000, retryAfter * 1000 * 2 ** attempt);
					console.warn(
						`[telegram] 429 rate-limited, backing off ${extraDelay}ms`,
					);
					attempt++;
					continue;
				}
				if (!res.ok) {
					console.warn(`[telegram] ${method} HTTP ${res.status}`);
				}
				return;
			} catch (err) {
				console.warn(`[telegram] ${method} failed:`, err);
				return;
			}
		}
		console.warn(`[telegram] ${method} giving up after ${maxRetries} retries`);
	}

	async sendFile(
		chatId: string,
		filePath: string,
		caption?: string,
	): Promise<void> {
		if (process.env.CLAUDE_GATEWAY_TELEGRAM_POLLING === "0") {
			this.relayToRust({
				type: "telegram-send-file",
				chatId,
				path: filePath,
				caption,
			});
			return;
		}
		if (!this.token) return;
		const bytes = await readFile(filePath);
		const fd = new FormData();
		fd.append("chat_id", chatId);
		if (caption) {
			fd.append("caption", markdownToHtml(caption).slice(0, 1024));
			fd.append("parse_mode", "HTML");
		}
		fd.append("document", new Blob([bytes]), basename(filePath));
		await fetch(this.url("sendDocument"), { method: "POST", body: fd });
	}

	async react(chatId: string, messageId: string, emoji: string): Promise<void> {
		// Call Telegram API directly regardless of bridged mode — reactions are
		// stateless and don't need to round-trip through the Rust relay.
		if (!this.token) return;
		const body = {
			chat_id: chatId,
			message_id: Number(messageId),
			reaction: [{ type: "emoji", emoji }],
		};
		const res = await fetch(this.url("setMessageReaction"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const json = await res.json().catch(() => ({}));
			console.warn(
				"[telegram] setMessageReaction failed:",
				res.status,
				JSON.stringify(json),
			);
		}
	}

	private async pollLoop() {
		while (this.polling) {
			this.aborter = new AbortController();
			try {
				const res = await fetch(
					this.url(
						`getUpdates?offset=${this.offset}&timeout=${POLL_TIMEOUT_S}`,
					),
					{ signal: this.aborter.signal },
				);
				const json: any = await res.json();
				if (!json?.ok) {
					await new Promise((r) => setTimeout(r, 1500));
					continue;
				}
				for (const upd of json.result as any[]) {
					this.offset = upd.update_id + 1;
					const inc = this.toIncoming(upd);
					if (inc) {
						for (const h of this.handlers) {
							try {
								await h(inc);
							} catch (e) {
								console.warn("[telegram] handler error:", e);
							}
						}
					}
				}
			} catch (err) {
				if (this.polling) {
					console.warn("[telegram] poll error:", err);
					await new Promise((r) => setTimeout(r, 1500));
				}
			}
		}
	}

	private toIncoming(update: any): IncomingMessage | null {
		const m = update.message ?? update.channel_post;
		if (!m) return null;
		const text: string = m.text ?? m.caption ?? "";
		const chatId = String(m.chat.id);
		const userId = String(m.from?.id ?? m.chat.id);
		const messageId = String(m.message_id);

		const isCommand = text.startsWith("/");
		let command;
		if (isCommand) {
			const space = text.indexOf(" ");
			const head = space === -1 ? text : text.slice(0, space);
			const rest = space === -1 ? "" : text.slice(space + 1);
			// Strip @botname suffix.
			const name = head.slice(1).split("@")[0] ?? "";
			command = { name, args: rest };
		}

		return {
			channel: this.name,
			chatId,
			userId,
			messageId,
			text,
			ts: (m.date ?? Math.floor(Date.now() / 1000)) * 1000,
			raw: update,
			isCommand,
			command,
		};
	}
}
