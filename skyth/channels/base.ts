import type { InboundMessage, OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { isSenderAllowed } from "@/channels/policy";

export abstract class BaseChannel {
	readonly name: string = "base";
	protected readonly config: any;
	protected readonly bus: MessageBus;
	protected running = false;

	constructor(config: any, bus: MessageBus) {
		this.config = config;
		this.bus = bus;
	}

	abstract start(): Promise<void>;
	abstract stop(): Promise<void>;
	abstract send(msg: OutboundMessage): Promise<void>;

	isAllowed(senderId: string): boolean {
		return isSenderAllowed(this.config.allow_from, String(senderId), this.name);
	}

	async handleMessage(
		senderId: string,
		chatId: string,
		content: string,
		media: string[] = [],
		metadata: Record<string, any> = {},
	): Promise<void> {
		if (!this.isAllowed(senderId)) return;
		const msg: InboundMessage = {
			channel: this.name,
			senderId: String(senderId),
			chatId: String(chatId),
			content,
			media,
			metadata,
			timestamp: new Date(),
		};
		await this.bus.publishInbound(msg);
	}

	get isRunning(): boolean {
		return this.running;
	}
}
