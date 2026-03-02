import type { InboundMessage, OutboundMessage } from "@/bus/events";
import type { StreamCallback } from "@/providers/base";
import { AgentLoop } from "@/base/base_agent/runtime";

export class AgentLifecycle {
  private readonly runtime: AgentLoop;
  private started = false;

  constructor(params: ConstructorParameters<typeof AgentLoop>[0]) {
    this.runtime = new AgentLoop(params);
  }

  async init(): Promise<void> {
    // Runtime constructor performs eager dependency wiring.
  }

  async start(): Promise<void> {
    this.started = true;
  }

  async processMessage(msg: InboundMessage, overrideSessionKey?: string, onStream?: StreamCallback): Promise<OutboundMessage | null> {
    if (!this.started) {
      await this.start();
    }
    return await this.runtime.processMessage(msg, overrideSessionKey, onStream);
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  async destroy(): Promise<void> {
    this.started = false;
  }

  getRuntime(): AgentLoop {
    return this.runtime;
  }
}
