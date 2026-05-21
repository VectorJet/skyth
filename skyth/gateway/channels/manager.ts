/**
 * ChannelManager owns the live Channel instances and routes their incoming
 * messages into a single MessageRouter. It also exposes a uniform send/react/
 * sendFile API so internal tools (channel_send_file, channel_react) don't
 * need to know about channel-specific SDKs.
 *
 * Per-chat workspace assignment: every incoming message touches a workspace
 * keyed by `<channel>:<chatId>` so each Telegram chat / browser tab has its
 * own isolated HEARTBEAT.md, INBOX/, OUTBOX/, notes/, rag/.
 */
import type {
	Channel,
	IncomingMessage,
	SendOpts,
	SlashCommand,
} from "@/gateway/channels/types.ts";
import { wrapGatewayMessage } from "@/gateway/channels/format.ts";
import { MessageRouter } from "@/gateway/channels/queue.ts";
import { rateLimiter } from "@/gateway/channels/rate-limit.ts";
import type { WorkspaceManager } from "@/gateway/workspace/index.ts";

export class ChannelManager {
	private channels = new Map<string, Channel>();
	readonly router = new MessageRouter();
	private workspaceManager: WorkspaceManager | null = null;

	/**
	 * Bind a workspace manager so each incoming message provisions a per-chat
	 * workspace before it reaches Claude. Optional: if unset, only the default
	 * workspace is used.
	 */
	bindWorkspaces(wm: WorkspaceManager) {
		this.workspaceManager = wm;
	}

	register(channel: Channel) {
		this.channels.set(channel.name, channel);
		channel.onIncoming((msg) => this.handleIncoming(channel, msg));
	}

	get(name: string): Channel | undefined {
		return this.channels.get(name);
	}

	list(): Channel[] {
		return Array.from(this.channels.values());
	}

	async startAll() {
		for (const ch of this.channels.values()) {
			try {
				await ch.start();
				console.log(`[channels] started ${ch.name}`);
			} catch (e) {
				console.warn(`[channels] failed to start ${ch.name}:`, e);
			}
		}
	}

	async stopAll() {
		for (const ch of this.channels.values()) {
			try {
				await ch.stop();
			} catch {}
		}
	}

	/**
	 * Send through a named channel. If `opts.fromGateway` is true the body is
	 * wrapped with `[GATEWAY]` *before* being passed to the channel — channels
	 * may strip the prefix when rendering for humans.
	 */
	async send(
		channelName: string,
		chatId: string,
		body: string,
		opts: SendOpts = {},
	) {
		const ch = this.channels.get(channelName);
		if (!ch) throw new Error(`Unknown channel: ${channelName}`);
		const text = opts.fromGateway ? wrapGatewayMessage(body) : body;
		await rateLimiter.acquire(channelName, chatId);
		await ch.send(chatId, text, opts);
	}

	async sendFile(
		channelName: string,
		chatId: string,
		path: string,
		caption?: string,
	) {
		const ch = this.channels.get(channelName);
		if (!ch) throw new Error(`Unknown channel: ${channelName}`);
		if (!ch.capabilities.files)
			throw new Error(`Channel ${channelName} does not support files`);
		await rateLimiter.acquire(channelName, chatId);
		await ch.sendFile(chatId, path, caption);
	}

	async react(
		channelName: string,
		chatId: string,
		messageId: string,
		emoji: string,
	) {
		const ch = this.channels.get(channelName);
		if (!ch) throw new Error(`Unknown channel: ${channelName}`);
		if (!ch.capabilities.reactions)
			throw new Error(`Channel ${channelName} does not support reactions`);
		await ch.react(chatId, messageId, emoji);
	}

	registerCommand(channelName: string, cmd: SlashCommand) {
		const ch = this.channels.get(channelName);
		if (!ch) throw new Error(`Unknown channel: ${channelName}`);
		ch.registerCommand(cmd);
	}

	private handleIncoming(channel: Channel, msg: IncomingMessage) {
		// Provision per-chat workspace lazily so Claude sees an isolated sandbox
		// per Telegram chat / browser tab. This is fire-and-forget; the workspace
		// is ready by the time the router actually drains.
		if (this.workspaceManager) {
			void this.workspaceManager
				.get(`${msg.channel}:${msg.chatId}`)
				.catch((err) => {
					console.warn("[channels] workspace provisioning failed:", err);
				});
		}

		// Slash commands short-circuit the router.
		if (msg.isCommand && msg.command) {
			const cmd = channel
				.listCommands()
				.find((c) => c.name === msg.command!.name);
			if (cmd) {
				const reply = (text: string) =>
					channel.send(msg.chatId, text, { replyTo: msg.messageId });
				void cmd
					.handler({ channel, msg, args: msg.command.args, reply })
					.catch((err) => {
						void reply(
							`[GATEWAY] command /${cmd.name} failed: ${String(err?.message ?? err)}`,
						);
					});
				return;
			}
			// Unknown command: drop silently. Forwarding to Claude as a "normal
			// message" pollutes the conversation with shell-looking text and may
			// duplicate something already handled out-of-band (e.g. /session, /new
			// are intercepted in the Rust relay before broadcasting here).
			console.log(
				`[channels] dropping unknown slash command /${msg.command.name}`,
			);
			return;
		}

		this.router.enqueueUser(msg);
	}
}
