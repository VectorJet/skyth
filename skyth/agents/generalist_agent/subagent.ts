import { MessageBus } from "../../bus/queue";
import type { InboundMessage } from "../../bus/events";

interface SpawnParams {
  task: string;
  label?: string;
  originChannel: string;
  originChatId: string;
}

export class SubagentManager {
  constructor(private readonly params: { bus: MessageBus }) {}

  async spawn(input: SpawnParams): Promise<string> {
    const id = crypto.randomUUID().slice(0, 8);
    const label = input.label?.trim() || input.task.slice(0, 30) || "task";

    const announce: InboundMessage = {
      channel: "system",
      senderId: "subagent",
      chatId: `${input.originChannel}:${input.originChatId}`,
      content: `[Background task queued]\n\nTask: ${input.task}\n\nResult: Background subagent runtime is not yet fully implemented in TS.`,
    };

    await this.params.bus.publishInbound(announce);
    return `Subagent [${label}] started (id: ${id}).`;
  }
}
