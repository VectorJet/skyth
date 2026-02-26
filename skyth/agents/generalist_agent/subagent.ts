import type { LLMProvider } from "@/agents/../providers/base";
import { MessageBus } from "@/agents/../bus/queue";
import type { InboundMessage } from "@/agents/../bus/events";
import { ToolRegistry } from "@/agents/generalist_agent/tools/registry";
import { ReadFileTool, WriteFileTool, EditFileTool, ListDirTool } from "@/agents/generalist_agent/tools/filesystem";
import { ExecTool } from "@/agents/generalist_agent/tools/shell";
import { WebFetchTool } from "@/agents/generalist_agent/tools/web";

export class SubagentManager {
  private readonly provider: LLMProvider;
  private readonly workspace: string;
  private readonly bus: MessageBus;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly execTimeout: number;
  private readonly restrictToWorkspace: boolean;
  private readonly runningTasks = new Map<string, Promise<void>>();

  constructor(params: {
    provider: LLMProvider;
    workspace: string;
    bus: MessageBus;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    exec_timeout?: number;
    restrict_to_workspace?: boolean;
  }) {
    this.provider = params.provider;
    this.workspace = params.workspace;
    this.bus = params.bus;
    this.model = params.model ?? params.provider.getDefaultModel();
    this.temperature = params.temperature ?? 0.7;
    this.maxTokens = params.max_tokens ?? 4096;
    this.execTimeout = params.exec_timeout ?? 60;
    this.restrictToWorkspace = Boolean(params.restrict_to_workspace);
  }

  async spawn(params: { task: string; label?: string; originChannel: string; originChatId: string }): Promise<string> {
    const taskId = crypto.randomUUID().slice(0, 8);
    const label = params.label?.trim() || (params.task.length > 30 ? `${params.task.slice(0, 30)}...` : params.task);
    const run = this.runSubagent(taskId, params.task, label, { channel: params.originChannel, chatId: params.originChatId });
    this.runningTasks.set(taskId, run);
    run.finally(() => this.runningTasks.delete(taskId));
    return `Subagent [${label}] started (id: ${taskId}). I'll notify you when it completes.`;
  }

  private async runSubagent(taskId: string, task: string, label: string, origin: { channel: string; chatId: string }): Promise<void> {
    try {
      const tools = new ToolRegistry();
      const allowedDir = this.restrictToWorkspace ? this.workspace : undefined;
      tools.register(new ReadFileTool(this.workspace, allowedDir));
      tools.register(new WriteFileTool(this.workspace, allowedDir));
      tools.register(new EditFileTool(this.workspace, allowedDir));
      tools.register(new ListDirTool(this.workspace, allowedDir));
      tools.register(new ExecTool(this.execTimeout, this.workspace, undefined, this.restrictToWorkspace));
      tools.register(new WebFetchTool());

      const messages: Array<Record<string, any>> = [
        { role: "system", content: this.buildSubagentPrompt(task) },
        { role: "user", content: task },
      ];

      let finalResult: string | null = null;
      for (let iteration = 0; iteration < 15; iteration += 1) {
        const response = await this.provider.chat({
          messages,
          tools: tools.getDefinitions(),
          model: this.model,
          temperature: this.temperature,
          max_tokens: this.maxTokens,
        });

        if (response.tool_calls.length) {
          const toolCalls = response.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          }));

          messages.push({
            role: "assistant",
            content: response.content ?? "",
            tool_calls: toolCalls,
            ...(response.reasoning_content !== undefined ? { reasoning_content: response.reasoning_content } : {}),
          });

          for (const toolCall of response.tool_calls) {
            const result = await tools.execute(toolCall.name, toolCall.arguments);
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.name,
              content: result,
            });
          }
          continue;
        }

        finalResult = response.content;
        break;
      }

      const content = finalResult ?? "Task completed but no final response was generated.";
      await this.announceResult(taskId, label, task, content, origin, "ok");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.announceResult(taskId, label, task, `Error: ${message}`, origin, "error");
    }
  }

  private async announceResult(taskId: string, label: string, task: string, result: string, origin: { channel: string; chatId: string }, status: "ok" | "error"): Promise<void> {
    const statusText = status === "ok" ? "completed successfully" : "failed";
    const announceContent = `[Subagent '${label}' ${statusText}]\n\nTask: ${task}\n\nResult:\n${result}\n\nSummarize this naturally for the user. Keep it brief (1-2 sentences). Do not mention technical details like \"subagent\" or task IDs.`;
    const msg: InboundMessage = {
      channel: "system",
      senderId: "subagent",
      chatId: `${origin.channel}:${origin.chatId}`,
      content: announceContent,
      metadata: { subagent_id: taskId, status },
    };
    await this.bus.publishInbound(msg);
  }

  private buildSubagentPrompt(_task: string): string {
    const now = new Date();
    const nowText = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return [
      "# Subagent",
      "",
      "You are a subagent spawned by the main agent to complete a specific task.",
      "",
      "## Current Time",
      nowText,
      "",
      "## Rules",
      "1. Stay focused on the assigned task only",
      "2. Be concise and factual",
      "3. Use tools as needed to complete the task",
      "4. Return a clear final result",
      "",
      "## Workspace",
      this.workspace,
      `Skills are available at: ${this.workspace}/skills/ (read SKILL.md files as needed)`,
    ].join("\n");
  }

  get runningCount(): number {
    return this.runningTasks.size;
  }
}
