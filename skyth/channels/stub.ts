import type { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { BaseChannel } from "@/channels/base";

export class StubChannel extends BaseChannel {
  override readonly name: string;

  constructor(name: string, config: any, bus: MessageBus) {
    super(config, bus);
    this.name = name;
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async send(_msg: OutboundMessage): Promise<void> {
    // Placeholder channel until full adapter migration.
  }
}
