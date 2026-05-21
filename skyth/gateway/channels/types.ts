/**
 * Channel abstraction. A channel is a bi-directional surface (Telegram, Web,
 * future: Slack/Discord/email) over which the gateway and the user exchange
 * messages.
 */

export interface ChannelCapabilities {
	reactions: boolean;
	files: boolean;
	/** Markdown flavor accepted by send(). */
	markdown: "none" | "v1" | "v2" | "full";
	maxTextBytes: number;
}

export interface IncomingFile {
	name: string;
	bytes: Uint8Array;
	mime: string;
}

export interface IncomingMessage {
	channel: string;
	chatId: string;
	userId: string;
	/** Channel-native message id (used for reactions / replies). */
	messageId: string;
	text: string;
	files?: IncomingFile[];
	ts: number;
	raw: unknown;
	/** True if this looks like a slash command (starts with `/`). */
	isCommand: boolean;
	command?: { name: string; args: string };
}

export interface SendOpts {
	/**
	 * If true, this message originates from the gateway (not relayed user
	 * content). The router will prefix `[GATEWAY]` to the text Claude sees.
	 * Channels MAY hide the prefix when rendering to humans.
	 */
	fromGateway?: boolean;
	/** Reply to a specific incoming message id, when supported. */
	replyTo?: string;
}

export interface SlashCommandContext {
	channel: Channel;
	msg: IncomingMessage;
	args: string;
	reply: (text: string) => Promise<void>;
}

export interface SlashCommand {
	name: string; // without leading `/`
	description: string; // shown in command menu
	scope?: "all" | "admin"; // future use
	handler: (ctx: SlashCommandContext) => Promise<void>;
}

export type IncomingHandler = (msg: IncomingMessage) => void | Promise<void>;

export interface Channel {
	readonly name: string;
	readonly capabilities: ChannelCapabilities;
	start(): Promise<void>;
	stop(): Promise<void>;
	send(chatId: string, text: string, opts?: SendOpts): Promise<void>;
	sendFile(chatId: string, filePath: string, caption?: string): Promise<void>;
	react(chatId: string, messageId: string, emoji: string): Promise<void>;
	onIncoming(handler: IncomingHandler): void;
	registerCommand(cmd: SlashCommand): void;
	listCommands(): SlashCommand[];
}
