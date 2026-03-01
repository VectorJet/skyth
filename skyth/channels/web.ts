import type { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { BaseChannel } from "@/channels/base";

export class WebChannel extends BaseChannel {
  override readonly name = "web";
  private broadcastFn?: (event: string, payload?: any) => void;

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
