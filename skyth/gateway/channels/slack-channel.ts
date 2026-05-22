import type {
	Channel,
	ChannelCapabilities,
	IncomingHandler,
	IncomingMessage,
	SendOpts,
	SlashCommand,
} from "@/gateway/channels/types.ts";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SlackChannel implements Channel {
	readonly name = "slack";
	readonly capabilities: ChannelCapabilities = {
		reactions: false,
		files: false,
		markdown: "full",
		maxTextBytes: 40000,
	};

	private ws?: WebSocket;
	private running = false;
	private runTask?: Promise<void>;
	private botUserId?: string;
	private handlers: IncomingHandler[] = [];
	private commands = new Map<string, SlashCommand>();

	constructor(private readonly config: Record<string, any>) {}

	async start(): Promise<void> {
		if (!this.config.bot_token || !this.config.app_token) {
			throw new Error("slack bot_token and app_token are required");
		}
		if ((this.config.mode ?? "socket") !== "socket") {
			throw new Error(`unsupported slack mode: ${this.config.mode}`);
		}
		this.botUserId = await this.resolveBotUserId();
		this.running = true;
		this.runTask = this.runSocketLoop();
	}

	async stop(): Promise<void> {
		this.running = false;
		this.ws?.close();
		if (this.runTask) await this.runTask.catch(() => undefined);
	}

	async send(chatId: string, text: string, opts: SendOpts = {}): Promise<void> {
		const payload: Record<string, any> = { channel: chatId, text };
		const threadTs = (opts as any)?.metadata?.slack?.thread_ts;
		if (threadTs) payload.thread_ts = threadTs;
		await this.slackApi("chat.postMessage", {
			token: this.config.bot_token,
			payload,
		});
	}

	async sendFile(
		chatId: string,
		filePath: string,
		caption?: string,
	): Promise<void> {
		await this.send(chatId, caption ? `${caption}\n${filePath}` : filePath);
	}

	async react(): Promise<void> {
		// Slack reaction support can be added once the current message timestamp is
		// carried through the generic SendOpts/IncomingMessage bridge.
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

	private async runSocketLoop(): Promise<void> {
		while (this.running) {
			try {
				const socketUrl = await this.openSocketConnection();
				await this.connectSocket(socketUrl);
			} catch (error) {
				console.warn("[slack] socket mode error:", error);
			}
			if (this.running) await sleep(5000);
		}
	}

	private async openSocketConnection(): Promise<string> {
		const response = await fetch(
			"https://slack.com/api/apps.connections.open",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.config.app_token}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: "",
			},
		);
		const json = await response.json().catch(() => ({}));
		if (!response.ok || !(json as any).ok || !(json as any).url) {
			throw new Error(
				`apps.connections.open failed: ${(json as any)?.error ?? response.status}`,
			);
		}
		return String((json as any).url);
	}

	private async connectSocket(url: string): Promise<void> {
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
				void this.handleSocketEnvelope(event.data).catch((err) =>
					console.warn("[slack] envelope error:", err),
				);
			});
			ws.addEventListener("close", () => settle(resolve));
			ws.addEventListener("error", () =>
				settle(() => reject(new Error("slack websocket error"))),
			);
		});
	}

	private async handleSocketEnvelope(
		raw: string | ArrayBuffer | Blob,
	): Promise<void> {
		const dataText =
			typeof raw === "string"
				? raw
				: raw instanceof ArrayBuffer
					? Buffer.from(raw).toString("utf-8")
					: await raw.text();
		let envelope: any;
		try {
			envelope = JSON.parse(dataText);
		} catch {
			return;
		}
		if (envelope.envelope_id && this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
		}
		if (envelope.type !== "events_api") return;
		const event = envelope.payload?.event ?? {};
		const eventType = String(event.type ?? "");
		if (eventType !== "message" && eventType !== "app_mention") return;
		if (event.subtype) return;

		const senderId = String(event.user ?? "").trim();
		const chatId = String(event.channel ?? "").trim();
		let text = String(event.text ?? "");
		const channelType = String(event.channel_type ?? "");
		if (!senderId || !chatId) return;
		if (this.botUserId && senderId === this.botUserId) return;
		if (!this.isAllowed(senderId, chatId, channelType)) return;
		if (channelType !== "im" && !this.shouldRespond(eventType, text, chatId))
			return;
		text = this.stripBotMention(text).trim();
		if (!text) return;
		await this.emit({
			channel: this.name,
			chatId,
			userId: senderId,
			messageId: String(event.ts ?? Date.now()),
			text,
			ts: Date.now(),
			raw: event,
			isCommand: text.startsWith("/"),
			command: this.commandFromText(text),
		});
	}

	private isAllowed(
		senderId: string,
		chatId: string,
		channelType: string,
	): boolean {
		if (channelType === "im") {
			if (!this.config.dm?.enabled) return false;
			if (this.config.dm?.policy === "allowlist") {
				return (
					Array.isArray(this.config.dm?.allow_from) &&
					this.config.dm.allow_from.includes(senderId)
				);
			}
			return true;
		}
		if (this.config.group_policy === "allowlist") {
			return (
				Array.isArray(this.config.group_allow_from) &&
				this.config.group_allow_from.includes(chatId)
			);
		}
		return true;
	}

	private shouldRespond(
		eventType: string,
		text: string,
		chatId: string,
	): boolean {
		if (this.config.group_policy === "open") return true;
		if (this.config.group_policy === "allowlist") {
			return (
				Array.isArray(this.config.group_allow_from) &&
				this.config.group_allow_from.includes(chatId)
			);
		}
		if (eventType === "app_mention") return true;
		return Boolean(this.botUserId && text.includes(`<@${this.botUserId}>`));
	}

	private stripBotMention(text: string): string {
		return this.botUserId ? text.replaceAll(`<@${this.botUserId}>`, "") : text;
	}

	private async resolveBotUserId(): Promise<string | undefined> {
		const auth = await this.slackApi("auth.test", {
			token: this.config.bot_token,
			payload: {},
		}).catch(() => undefined);
		return auth?.user_id ? String(auth.user_id) : undefined;
	}

	private async slackApi(
		method: string,
		params: { token: string; payload: Record<string, any> },
	): Promise<any> {
		const response = await fetch(`https://slack.com/api/${method}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${params.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(params.payload),
		});
		const json = await response.json().catch(() => ({}));
		if (!response.ok || !(json as any).ok) {
			throw new Error(
				`slack ${method} failed: ${(json as any)?.error ?? response.status}`,
			);
		}
		return json;
	}

	private commandFromText(text: string): IncomingMessage["command"] {
		if (!text.startsWith("/")) return undefined;
		const [head, ...rest] = text.slice(1).split(" ");
		return { name: head?.split("@")[0] ?? "", args: rest.join(" ") };
	}

	private async emit(message: IncomingMessage): Promise<void> {
		for (const handler of this.handlers) await handler(message);
	}
}
