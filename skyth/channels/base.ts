import { InboundMessage, OutboundMessage } from "../bus/events";
import { MessageBus } from "../bus/queue";

export abstract class BaseChannel {
  readonly name = "base";
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
    const allowList = (this.config.allow_from ?? []).map((item: unknown) => String(item));
    if (!allowList.length) return true;
    if (allowList.includes(String(senderId))) return true;
    if (String(senderId).includes("|")) {
      return String(senderId).split("|").some((part) => part && allowList.includes(part));
    }
    return false;
  }

  async handleMessage(senderId: string, chatId: string, content: string, media: string[] = [], metadata: Record<string, any> = {}): Promise<void> {
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
