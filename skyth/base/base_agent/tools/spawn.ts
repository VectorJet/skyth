import { SubagentManager } from "@/base/base_agent/delegation/manager";
import { BaseTool } from "@/base/tool";

export class SpawnTool extends BaseTool {
  private originChannel = "cli";
  private originChatId = "direct";

  constructor(private readonly manager: SubagentManager) {
    super();
  }

  setContext(channel: string, chatId: string): void {
    this.originChannel = channel;
    this.originChatId = chatId;
  }

  get name(): string { return "spawn"; }
  get description(): string {
    return "Spawn a background subagent task and notify this conversation when complete.";
  }
  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        task: { type: "string" },
        label: { type: "string" },
      },
      required: ["task"],
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const task = String(params.task ?? "").trim();
    const label = params.label !== undefined ? String(params.label) : undefined;
    if (!task) return "Error: task is required";

    return await this.manager.spawn({
      task,
      label,
      originChannel: this.originChannel,
      originChatId: this.originChatId,
    });
  }
}
