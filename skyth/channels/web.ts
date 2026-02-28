import { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { BaseChannel } from "@/channels/base";
import { eventLine } from "@/logging/events";

export class WebChannel extends BaseChannel {
  readonly name = "web";

  constructor(config: any, bus: MessageBus) {
    super(config, bus);
  }

  async start(): Promise<void> {
    // WebChannel relies on the gateway server for connections, so
    // there's no active polling or background task to spin up here.
    this.running = true;
    console.log(eventLine("event", "web", "status", "started"));
  }

  async stop(): Promise<void> {
    this.running = false;
    console.log(eventLine("event", "web", "status", "stopped"));
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.running) return;
    
    // Inbound from gateway WebSocket already drops into the bus.
    // Outbound messages for the web channel are handled directly by 
    // the gateway broadcasting, so this method serves as a pass-through 
    // or placeholder depending on how you've wired gateway outbound.
    
    // For now, simply log that the channel processed the outbound intent.
    console.log(eventLine("event", "web", "send", `chatId: ${msg.chatId}`));
  }
}