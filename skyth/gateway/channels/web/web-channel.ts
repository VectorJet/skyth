/**
 * WebChannel: bridges to the existing chrome-extension WebSocket relay
 * (default ws://127.0.0.1:38427). The gateway connects as a client and
 * publishes `gateway-turn` messages to be picked up by content.js, which
 * drops them into the active claude.ai conversation.
 *
 * Reverse direction (claude.ai → gateway) is observed by listening for
 * `claude-response` messages from the extension; content.js posts those
 * after streaming completes so the gateway can mirror replies into a channel
 * (e.g., relay back to Telegram).
 *
 * Contract (extension side, future patch):
 *   gateway → extension:  { type: 'gateway-turn', chatId, text, traceId }
 *   extension → gateway:  { type: 'claude-response', chatId, text, traceId }
 *   extension → gateway:  { type: 'web-incoming', chatId, userId, messageId, text } (optional)
 */
import type {
	Channel,
	ChannelCapabilities,
	IncomingHandler,
	IncomingMessage,
	SendOpts,
	SlashCommand,
} from "@/gateway/channels/types.ts";
import { spawn } from "node:child_process";
import { getMemoryStore } from "@/gateway/memory/store.ts";

const DEFAULT_URL = process.env.CLAUDE_GATEWAY_EXT_WS ?? "ws://127.0.0.1:38427";
const WS_PORT = 38427;
const RELAY_TYPE = "gateway-turn";
const NEW_THREAD_TYPE = "gateway-new-thread";
const NEW_THREAD_RESULT_TYPE = "gateway-new-thread-result";
const INCOMING_TYPE = "web-incoming";
const RESPONSE_TYPE = "claude-response";

type Pending = {
	resolve: (text: string) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

type PendingNewThread = {
	resolve: (result: NewThreadResult) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

export type NewThreadResult = {
	ok: boolean;
	traceId: string;
	kind: "handoff" | "compaction";
	switched: boolean;
	threadId?: string;
	url?: string;
	error?: string;
};

export class WebChannel implements Channel {
	readonly name = "web";
	readonly capabilities: ChannelCapabilities = {
		reactions: false,
		files: true,
		markdown: "full",
		maxTextBytes: 32_000,
	};

	private commands: SlashCommand[] = [];
	private handlers: IncomingHandler[] = [];
	private ws: WebSocket | null = null;
	private url: string;
	private reconnectAttempts = 0;
	private pending = new Map<string, Pending>();
	private pendingNewThreads = new Map<string, PendingNewThread>();
	private alive = false;
	/** Whether we ever achieved an OPEN state. Until then, suppress noisy
	 * disconnect/error logs so the gateway's first-run output stays readable
	 * when the chrome-extension WS server isn't up yet. */
	private everConnected = false;
	/** Whether we've already announced the "waiting for ws server" notice. */
	private warnedNotUp = false;
	/**
	 * Tabs that have announced themselves via `gateway-hello` (chatId → last
	 * seen ts). Used by Phase 3 multi-tab routing so cross-channel turns
	 * (e.g., Telegram → web bridge) can pick a connected tab instead of the
	 * legacy hardcoded 'default'.
	 */
	private knownTabs = new Map<string, number>();
	private rrCursor = 0;

	constructor(url: string = DEFAULT_URL) {
		this.url = url;
	}

	async start(): Promise<void> {
		this.alive = true;
		this.startRelayServer();
		this.connect();
	}

	private startRelayServer() {
		const relayPath = process.env.CLAUDE_GATEWAY_RELAY_PATH;
		if (relayPath) {
			console.log("[web] Starting relay server from:", relayPath);
			const child = spawn("bun", [relayPath], {
				detached: true,
				stdio: "ignore",
			});
			child.unref();
		} else if (process.env.CLAUDE_GATEWAY_TELEGRAM_POLLING !== "0") {
			const { WebSocketServer } = require("ws");
			const wss = new WebSocketServer({ port: WS_PORT });
			wss.on("connection", (ws: any) => {
				ws.send(JSON.stringify({ type: "gateway-hello", role: "gateway" }));
			});
			console.log(`[web] Relay server started on ws://127.0.0.1:${WS_PORT}`);
		}
	}

	async stop(): Promise<void> {
		this.alive = false;
		this.ws?.close();
		this.ws = null;
	}

	onIncoming(handler: IncomingHandler): void {
		this.handlers.push(handler);
	}

	registerCommand(cmd: SlashCommand): void {
		this.commands.push(cmd);
	}

	listCommands(): SlashCommand[] {
		return this.commands;
	}

	async send(
		chatId: string,
		text: string,
		_opts: SendOpts = {},
	): Promise<void> {
		const traceId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		this.relay({ type: RELAY_TYPE, chatId, text, traceId });
	}

	/**
	 * Send a turn and await the extension's `claude-response` echo. Used as the
	 * Phase-2 Claude runner: the gateway hands a turn to the active claude.ai
	 * conversation and waits for completion so it can mirror the reply back to
	 * the originating channel (e.g., Telegram).
	 */
	async sendAndAwaitResponse(
		chatId: string,
		text: string,
		timeoutMs = 60_000,
	): Promise<string> {
		const traceId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const promise = new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(traceId);
				reject(new Error("claude-response timeout"));
			}, timeoutMs);
			this.pending.set(traceId, { resolve, reject, timer });
		});
		this.relay({ type: RELAY_TYPE, chatId, text, traceId });
		return promise;
	}

	async startThread(
		text: string,
		opts: {
			kind?: "handoff" | "compaction";
			switchToNew?: boolean;
			sourceThreadId?: string;
			handoffId?: string;
			timeoutMs?: number;
		} = {},
	): Promise<NewThreadResult> {
		const traceId = `nt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const timeoutMs =
			opts.timeoutMs ??
			Number(process.env.CLAUDE_GATEWAY_NEW_THREAD_TIMEOUT_MS ?? 120_000);
		const promise = new Promise<NewThreadResult>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingNewThreads.delete(traceId);
				reject(new Error("gateway-new-thread timeout"));
			}, timeoutMs);
			this.pendingNewThreads.set(traceId, { resolve, reject, timer });
		});
		this.relay({
			type: NEW_THREAD_TYPE,
			text,
			traceId,
			kind: opts.kind ?? "handoff",
			switchToNew: opts.switchToNew === true,
			sourceThreadId: opts.sourceThreadId,
			handoffId: opts.handoffId,
		});
		return promise;
	}

	async sendFile(
		chatId: string,
		filePath: string,
		caption?: string,
	): Promise<void> {
		// Web file delivery is best-effort: hand the absolute path to the
		// extension which can convert to computer:// links.
		this.relay({ type: "gateway-file", chatId, filePath, caption });
	}

	async react(): Promise<void> {
		/* not supported */
	}

	/** True when the WS bridge is ready to dispatch turns. */
	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	/**
	 * Pick a tab to dispatch a turn to when the originating channel is not the
	 * web itself (e.g., Telegram). Strategy: round-robin over known tabs that
	 * announced themselves via `gateway-hello`. If no tab is known yet, fall
	 * back to the legacy `'default'` chatId so the contract still functions
	 * with older content scripts.
	 */
	pickTab(): string {
		const tabs = Array.from(this.knownTabs.keys());
		if (tabs.length === 0) return "default";
		const id = tabs[this.rrCursor % tabs.length]!;
		this.rrCursor = (this.rrCursor + 1) % tabs.length;
		return id;
	}

	/** Currently-known tab chatIds (most-recent-first). */
	knownTabIds(): string[] {
		return Array.from(this.knownTabs.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([id]) => id);
	}

	private relay(payload: Record<string, unknown>) {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(payload));
		} else {
			console.warn("[web] not connected; dropping payload", payload.type);
		}
	}

	private connect() {
		if (!this.alive) return;
		try {
			this.ws = new WebSocket(this.url);
		} catch (err) {
			console.warn("[web] WebSocket constructor failed:", err);
			this.scheduleReconnect();
			return;
		}
		this.ws.addEventListener("open", () => {
			this.reconnectAttempts = 0;
			console.log(`[web] connected to ${this.url}`);
			// Hello so the extension can flag a gateway peer.
			this.relay({ type: "gateway-hello", role: "gateway" });
		});
		this.ws.addEventListener("message", (ev) =>
			this.onMessage(String(ev.data)),
		);
		this.ws.addEventListener("close", () => {
			console.log("[web] disconnected");
			this.scheduleReconnect();
		});
		this.ws.addEventListener("error", (ev) => {
			console.warn("[web] socket error", ev);
		});
	}

	private scheduleReconnect() {
		if (!this.alive) return;
		this.reconnectAttempts++;
		const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempts);
		setTimeout(() => this.connect(), delay);
	}

	private onMessage(raw: string) {
		let msg: any;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}
		if (
			msg.type === "gateway-hello" &&
			msg.role === "web-tab" &&
			typeof msg.chatId === "string"
		) {
			this.knownTabs.set(msg.chatId, Date.now());
			console.log(
				`[web] tab announced: ${msg.chatId} (${this.knownTabs.size} total)`,
			);
			return;
		}
		if (msg.type === RESPONSE_TYPE && typeof msg.traceId === "string") {
			this.recordAssistantResponse(msg);
			const p = this.pending.get(msg.traceId);
			if (p) {
				clearTimeout(p.timer);
				this.pending.delete(msg.traceId);
				p.resolve(String(msg.text ?? ""));
			}
			// Refresh tab liveness on successful response.
			if (typeof msg.chatId === "string")
				this.knownTabs.set(msg.chatId, Date.now());
			return;
		}
		if (
			msg.type === NEW_THREAD_RESULT_TYPE &&
			typeof msg.traceId === "string"
		) {
			const p = this.pendingNewThreads.get(msg.traceId);
			if (p) {
				clearTimeout(p.timer);
				this.pendingNewThreads.delete(msg.traceId);
				p.resolve({
					ok: msg.ok !== false,
					traceId: msg.traceId,
					kind: msg.kind === "compaction" ? "compaction" : "handoff",
					switched: msg.switched === true,
					threadId: typeof msg.threadId === "string" ? msg.threadId : undefined,
					url: typeof msg.url === "string" ? msg.url : undefined,
					error: typeof msg.error === "string" ? msg.error : undefined,
				});
			}
			if (typeof msg.threadId === "string")
				this.knownTabs.set(msg.threadId, Date.now());
			return;
		}
		if (msg.type === "gateway-new-thread-status") {
			console.log(
				`[web] new-thread status trace=${String(msg.traceId ?? "")} stage=${String(msg.stage ?? "")} detail=${String(msg.detail ?? "")}`,
			);
			return;
		}
		if (msg.type === "telegram-incoming") {
			const t = msg.msg;
			const inc: IncomingMessage = {
				channel: "telegram",
				chatId: String(t.chat_id),
				userId: String(t.sender_username ?? t.chat_id),
				messageId: String(t.message_id ?? Date.now()),
				text: String(t.text ?? ""),
				ts: Date.now(),
				raw: t,
				isCommand: typeof t.text === "string" && t.text.startsWith("/"),
				command: undefined,
			};
			if (inc.isCommand) {
				const space = inc.text.indexOf(" ");
				const head = space === -1 ? inc.text : inc.text.slice(0, space);
				inc.command = {
					name: head.slice(1),
					args: space === -1 ? "" : inc.text.slice(space + 1),
				};
			}
			// Forward to all handlers (MessageRouter will catch this)
			const rt = (globalThis as any).runtime;
			if (rt) {
				const tg = rt.channelManager.get("telegram");
				if (tg) {
					// This is a bit of a hack: manually triggering the handler of the
					// Telegram channel so it goes through its router binding.
					(tg as any).handlers.forEach((h: any) => h(inc));
				}
			}
			return;
		}
		if (
			msg.type === "telegram-react" ||
			msg.type === "telegram-send" ||
			msg.type === "telegram-send-file"
		) {
			// These originate from the mcp-gateway TelegramChannel.relayToRust() and
			// need to be handled by the Rust side of the bridge. Since we are
			// currently connected TO the Rust side's relay server, we just
			// acknowledge they exist. Actually, the Rust side needs to receive these
			// from its OWN WebSocket server.
			//
			// Wait: relayToRust sends to `web.ws`. `web.ws` is a connection TO the
			// Rust relay server. So when `telegram.react()` calls `web.ws.send()`,
			// the Rust relay server (in handler/mod.rs) receives it directly in its
			// loop and calls `handle_telegram_react()`.
			//
			// So the fact that I'm seeing this message in `onMessage` means the Rust
			// relay server BROADCASTED it back to us (and all other clients). We
			// should just ignore it here to avoid loops.
			return;
		}
		if (msg.type === INCOMING_TYPE) {
			if (typeof msg.chatId === "string")
				this.knownTabs.set(msg.chatId, Date.now());
			const inc: IncomingMessage = {
				channel: this.name,
				chatId: String(msg.chatId ?? "web"),
				userId: String(msg.userId ?? "web"),
				messageId: String(msg.messageId ?? Date.now()),
				text: String(msg.text ?? ""),
				ts: Date.now(),
				raw: msg,
				isCommand: typeof msg.text === "string" && msg.text.startsWith("/"),
				command: undefined,
			};
			if (inc.isCommand) {
				const space = inc.text.indexOf(" ");
				const head = space === -1 ? inc.text : inc.text.slice(0, space);
				inc.command = {
					name: head.slice(1),
					args: space === -1 ? "" : inc.text.slice(space + 1),
				};
			}
			for (const h of this.handlers) void h(inc);
		}
	}

	private recordAssistantResponse(msg: any): void {
		if (process.env.CLAUDE_GATEWAY_MEMORY_RECORD === "0") return;
		if (typeof msg.text !== "string" || !msg.text.trim()) return;
		try {
			getMemoryStore().upsertGatewayTurn({
				channel: "web",
				chatId: String(msg.chatId ?? "web"),
				assistantText: msg.text,
				traceId: String(msg.traceId ?? Date.now()),
				ts: Date.now(),
			});
		} catch (err) {
			console.warn("[memory] failed to record assistant response:", err);
		}
	}
}
