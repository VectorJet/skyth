import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	Channel,
	ChannelCapabilities,
	IncomingHandler,
	IncomingMessage,
	SendOpts,
	SlashCommand,
} from "@/gateway/channels/types.ts";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_MESSAGE_LEN = 2000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitMessage(content: string, maxLen = MAX_MESSAGE_LEN): string[] {
	if (!content) return [];
	if (content.length <= maxLen) return [content];
	const chunks: string[] = [];
	let remaining = content;
	while (remaining.length > maxLen) {
		const cut = remaining.slice(0, maxLen);
		let pos = cut.lastIndexOf("\n");
		if (pos <= 0) pos = cut.lastIndexOf(" ");
		if (pos <= 0) pos = maxLen;
		chunks.push(remaining.slice(0, pos));
		remaining = remaining.slice(pos).trimStart();
	}
	if (remaining) chunks.push(remaining);
	return chunks;
}

export class DiscordChannel implements Channel {
	readonly name = "discord";
	readonly capabilities: ChannelCapabilities = {
		reactions: true,
		files: true,
		markdown: "full",
		maxTextBytes: MAX_MESSAGE_LEN,
	};

	private ws?: WebSocket;
	private seq: number | null = null;
	private running = false;
	private runTask?: Promise<void>;
	private heartbeatTimer?: ReturnType<typeof setInterval>;
	private handlers: IncomingHandler[] = [];
	private commands = new Map<string, SlashCommand>();

	constructor(private readonly config: Record<string, any>) {}

	async start(): Promise<void> {
		if (!this.config.token) throw new Error("discord token is required");
		this.running = true;
		this.runTask = this.runLoop();
	}

	async stop(): Promise<void> {
		this.running = false;
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		this.heartbeatTimer = undefined;
		this.ws?.close();
		if (this.runTask) await this.runTask.catch(() => undefined);
	}

	async send(chatId: string, text: string, opts: SendOpts = {}): Promise<void> {
		const chunks = splitMessage(text);
		if (!chunks.length) return;
		const url = `${DISCORD_API_BASE}/channels/${chatId}/messages`;
		const headers = {
			Authorization: `Bot ${this.config.token}`,
			"Content-Type": "application/json",
		};
		for (let i = 0; i < chunks.length; i += 1) {
			const payload: Record<string, any> = { content: chunks[i] };
			if (i === 0 && opts.replyTo) {
				payload.message_reference = { message_id: opts.replyTo };
				payload.allowed_mentions = { replied_user: false };
			}
			const ok = await this.postJson(url, headers, payload);
			if (!ok) break;
		}
	}

	async sendFile(
		chatId: string,
		filePath: string,
		caption?: string,
	): Promise<void> {
		await this.send(chatId, caption ? `${caption}\n${filePath}` : filePath);
	}

	async react(chatId: string, messageId: string, emoji: string): Promise<void> {
		await this.putJson(
			`${DISCORD_API_BASE}/channels/${chatId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
			{
				Authorization: `Bot ${this.config.token}`,
			},
		);
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

	private async runLoop(): Promise<void> {
		while (this.running) {
			try {
				await this.connectOnce();
			} catch (error) {
				console.warn("[discord] gateway error:", error);
			}
			if (this.running) await sleep(5000);
		}
	}

	private async connectOnce(): Promise<void> {
		const url =
			this.config.gateway_url ?? "wss://gateway.discord.gg/?v=10&encoding=json";
		await new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(url);
			this.ws = ws;
			let settled = false;
			const settle = (fn: () => void): void => {
				if (settled) return;
				settled = true;
				fn();
			};
			ws.addEventListener("message", (event) => {
				if (!this.running) return;
				void this.onGatewayPayload(event.data).catch((err) =>
					console.warn("[discord] message handling error:", err),
				);
			});
			ws.addEventListener("close", () => settle(resolve));
			ws.addEventListener("error", () =>
				settle(() => reject(new Error("discord websocket error"))),
			);
		});
	}

	private async onGatewayPayload(
		raw: string | ArrayBuffer | Blob,
	): Promise<void> {
		const dataText =
			typeof raw === "string"
				? raw
				: raw instanceof ArrayBuffer
					? Buffer.from(raw).toString("utf-8")
					: await raw.text();
		let data: any;
		try {
			data = JSON.parse(dataText);
		} catch {
			return;
		}
		if (typeof data.s === "number") this.seq = data.s;
		if (data.op === 10) {
			this.startHeartbeat(
				Math.max(5000, Number(data.d?.heartbeat_interval ?? 45000)),
			);
			this.identify();
			return;
		}
		if (data.op === 7 || data.op === 9) {
			this.ws?.close();
			return;
		}
		if (data.op === 0 && data.t === "MESSAGE_CREATE")
			await this.handleMessageCreate(data.d ?? {});
	}

	private startHeartbeat(intervalMs: number): void {
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		this.heartbeatTimer = setInterval(() => {
			if (!this.running || !this.ws || this.ws.readyState !== WebSocket.OPEN)
				return;
			this.ws.send(JSON.stringify({ op: 1, d: this.seq }));
		}, intervalMs);
	}

	private identify(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(
			JSON.stringify({
				op: 2,
				d: {
					token: this.config.token,
					intents: this.config.intents ?? 37377,
					properties: { os: "skyth", browser: "skyth", device: "skyth" },
				},
			}),
		);
	}

	private async handleMessageCreate(
		payload: Record<string, any>,
	): Promise<void> {
		const author = payload.author ?? {};
		if (author.bot) return;
		const senderId = String(author.id ?? "").trim();
		const chatId = String(payload.channel_id ?? "").trim();
		if (!senderId || !chatId || !this.isAllowed(senderId, chatId)) return;
		const textParts = [String(payload.content ?? "")].filter(Boolean);
		const files = await this.cacheAttachments(payload.attachments);
		for (const file of files) textParts.push(`[attachment: ${file}]`);
		await this.emit({
			channel: this.name,
			chatId,
			userId: senderId,
			messageId: String(payload.id ?? ""),
			text: textParts.join("\n") || "[empty message]",
			ts: Date.now(),
			raw: payload,
			isCommand: String(payload.content ?? "").startsWith("/"),
			command: this.commandFromText(payload.content),
		});
	}

	private async cacheAttachments(attachments: unknown): Promise<string[]> {
		if (!Array.isArray(attachments)) return [];
		const out: string[] = [];
		const mediaDir = join(homedir(), ".skyth", "media", "discord");
		for (const attachment of attachments) {
			const item = attachment as Record<string, any>;
			const url = String(item.url ?? "").trim();
			const filename = String(item.filename ?? "attachment").replace(
				/[\\/]/g,
				"_",
			);
			if (!url || Number(item.size ?? 0) > MAX_ATTACHMENT_BYTES) continue;
			try {
				await mkdir(mediaDir, { recursive: true });
				const filePath = join(
					mediaDir,
					`${String(item.id ?? Date.now())}_${filename}`,
				);
				const response = await fetch(url);
				if (!response.ok) continue;
				await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
				out.push(filePath);
			} catch {}
		}
		return out;
	}

	private commandFromText(text: unknown): IncomingMessage["command"] {
		const body = String(text ?? "");
		if (!body.startsWith("/")) return undefined;
		const [head, ...rest] = body.slice(1).split(" ");
		return { name: head?.split("@")[0] ?? "", args: rest.join(" ") };
	}

	private async emit(message: IncomingMessage): Promise<void> {
		for (const handler of this.handlers) await handler(message);
	}

	private isAllowed(senderId: string, chatId: string): boolean {
		const allowed = this.config.allow_from;
		if (
			Array.isArray(allowed) &&
			allowed.length > 0 &&
			!allowed.includes(senderId)
		)
			return false;
		if (this.config.group_policy === "allowlist")
			return (
				Array.isArray(this.config.group_allow_from) &&
				this.config.group_allow_from.includes(chatId)
			);
		return true;
	}

	private async postJson(
		url: string,
		headers: Record<string, string>,
		payload: Record<string, any>,
	): Promise<boolean> {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const response = await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
			}).catch(() => undefined);
			if (!response) return false;
			if (response.status === 429) {
				const retry = Number(
					((await response.json().catch(() => ({}))) as any).retry_after ?? 1,
				);
				await sleep(Math.ceil(retry * 1000));
				continue;
			}
			return response.ok;
		}
		return false;
	}

	private async putJson(
		url: string,
		headers: Record<string, string>,
	): Promise<void> {
		await fetch(url, { method: "PUT", headers });
	}
}
