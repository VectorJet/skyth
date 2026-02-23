import { ContextBuilder } from "./context";
import { MemoryStore } from "./memory";
import { ToolRegistry } from "./tools/registry";
import { MessageBus } from "../../bus/queue";
import { sessionKey, type InboundMessage, type OutboundMessage } from "../../bus/events";
import { LLMProvider } from "../../providers/base";
import { Session, SessionManager } from "../../session/manager";
import { ReadFileTool, WriteFileTool, EditFileTool, ListDirTool } from "./tools/filesystem";
import { ExecTool } from "./tools/shell";
import { WebFetchTool, WebSearchTool } from "./tools/web";
import { MessageTool } from "./tools/message";
import { SpawnTool } from "./tools/spawn";
import { SubagentManager } from "./subagent";
import { CronTool } from "./tools/cron";
import { CronService } from "../../cron/service";

export class AgentLoop {
  readonly bus: MessageBus;
  readonly provider: LLMProvider;
  readonly workspace: string;
  readonly model: string;
  readonly maxIterations: number;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly memoryWindow: number;
  readonly context: ContextBuilder;
  readonly sessions: SessionManager;
  readonly tools: ToolRegistry;
  readonly _consolidating = new Set<string>();
  readonly _consolidation_tasks = new Set<Promise<void>>();
  readonly _consolidation_locks = new Map<string, Promise<void>>();
  readonly subagents: SubagentManager;
  readonly restrictToWorkspace: boolean;

  constructor(params: {
    bus: MessageBus;
    provider: LLMProvider;
    workspace: string;
    model?: string;
    max_iterations?: number;
    temperature?: number;
    max_tokens?: number;
    memory_window?: number;
    session_manager?: SessionManager;
    brave_api_key?: string;
    exec_timeout?: number;
    restrict_to_workspace?: boolean;
    cron_service?: CronService;
  }) {
    this.bus = params.bus;
    this.provider = params.provider;
    this.workspace = params.workspace;
    this.model = params.model ?? params.provider.getDefaultModel();
    this.maxIterations = params.max_iterations ?? 20;
    this.temperature = params.temperature ?? 0.7;
    this.maxTokens = params.max_tokens ?? 4096;
    this.memoryWindow = params.memory_window ?? 50;
    this.context = new ContextBuilder(this.workspace);
    this.sessions = params.session_manager ?? new SessionManager(params.workspace);
    this.tools = new ToolRegistry();
    this.subagents = new SubagentManager({ bus: this.bus });
    this.restrictToWorkspace = Boolean(params.restrict_to_workspace);

    const allowedDir = this.restrictToWorkspace ? this.workspace : undefined;
    this.tools.register(new ReadFileTool(this.workspace, allowedDir));
    this.tools.register(new WriteFileTool(this.workspace, allowedDir));
    this.tools.register(new EditFileTool(this.workspace, allowedDir));
    this.tools.register(new ListDirTool(this.workspace, allowedDir));
    this.tools.register(new ExecTool(params.exec_timeout ?? 60, this.workspace, undefined, this.restrictToWorkspace));
    this.tools.register(new WebSearchTool(params.brave_api_key ?? process.env.BRAVE_API_KEY ?? ""));
    this.tools.register(new WebFetchTool());
    this.tools.register(new MessageTool(this.bus.publishOutbound.bind(this.bus)));
    this.tools.register(new SpawnTool(this.subagents));
    if (params.cron_service) this.tools.register(new CronTool(params.cron_service));
  }

  private setToolContext(channel: string, chatId: string, messageId?: string): void {
    const messageTool = this.tools.get("message");
    if (messageTool instanceof MessageTool) messageTool.setContext(channel, chatId, messageId);

    const spawnTool = this.tools.get("spawn");
    if (spawnTool instanceof SpawnTool) spawnTool.setContext(channel, chatId);

    const cronTool = this.tools.get("cron");
    if (cronTool instanceof CronTool) cronTool.setContext(channel, chatId);
  }

  private stripThink(text: string | null): string | null {
    if (!text) return null;
    return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || null;
  }

  private async runAgentLoop(initialMessages: Array<Record<string, any>>): Promise<[string | null, string[]]> {
    let messages = initialMessages;
    let iteration = 0;
    let finalContent: string | null = null;
    const toolsUsed: string[] = [];

    while (iteration < this.maxIterations) {
      iteration += 1;
      const response = await this.provider.chat({
        messages,
        tools: this.tools.getDefinitions(),
        model: this.model,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });

      if (response.tool_calls.length) {
        const toolCallDicts = response.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        }));

        messages = this.context.addAssistantMessage(messages, response.content, toolCallDicts, response.reasoning_content ?? undefined);

        for (const toolCall of response.tool_calls) {
          toolsUsed.push(toolCall.name);
          const result = await this.tools.execute(toolCall.name, toolCall.arguments);
          messages = this.context.addToolResult(messages, toolCall.id, toolCall.name, result);
        }
      } else {
        finalContent = this.stripThink(response.content);
        break;
      }
    }

    return [finalContent, toolsUsed];
  }

  private waitForConsolidation(key: string): Promise<void> {
    return this._consolidation_locks.get(key) ?? Promise.resolve();
  }

  private setConsolidationLock(key: string, promise: Promise<void>): void {
    this._consolidation_locks.set(key, promise);
  }

  private clearConsolidationLock(key: string, promise: Promise<void>): void {
    if (this._consolidation_locks.get(key) === promise) this._consolidation_locks.delete(key);
  }

  async processMessage(msg: InboundMessage, overrideSessionKey?: string): Promise<OutboundMessage | null> {
    if (msg.channel === "system") {
      const [channel, chatId] = msg.chatId.includes(":") ? msg.chatId.split(":", 2) : ["cli", msg.chatId];
      const key = `${channel}:${chatId}`;
      return await this.processMessage({ ...msg, channel, chatId }, key);
    }

    const key = overrideSessionKey ?? sessionKey(msg);
    const session = this.sessions.getOrCreate(key);
    this.setToolContext(msg.channel, msg.chatId, String(msg.metadata?.message_id ?? "") || undefined);
    const previousChannel = String(session.metadata.last_channel ?? "");
    const previousChatId = String(session.metadata.last_chat_id ?? "");
    const platformChanged = Boolean(previousChannel && previousChatId) && (previousChannel !== msg.channel || previousChatId !== msg.chatId);

    const messageTool = this.tools.get("message");
    if (messageTool instanceof MessageTool) messageTool.startTurn();

    const cmd = msg.content.trim().toLowerCase();
    if (cmd === "/new") {
      await this.waitForConsolidation(session.key);

      const snapshot = session.messages.slice(session.lastConsolidated);
      if (snapshot.length) {
        const temp = new Session(session.key);
        temp.messages = [...snapshot];
        const ok = await this.consolidateMemory(temp, true);
        if (!ok) {
          return { channel: msg.channel, chatId: msg.chatId, content: "Memory archival failed, session not cleared. Please try again." };
        }
      }

      session.clear();
      this.sessions.save(session);
      this.sessions.invalidate(session.key);
      this._consolidating.delete(session.key);
      this._consolidation_locks.delete(session.key);
      return { channel: msg.channel, chatId: msg.chatId, content: "New session started." };
    }

    if (cmd === "/help") {
      return {
        channel: msg.channel,
        chatId: msg.chatId,
        content: "skyth commands:\n/new - start a new conversation\n/help - show available commands",
      };
    }

    const unconsolidated = session.messages.length - session.lastConsolidated;
    if (unconsolidated >= this.memoryWindow && !this._consolidating.has(session.key)) {
      this._consolidating.add(session.key);

      const promise = (async () => {
        try {
          await this.consolidateMemory(session, false);
        } finally {
          this._consolidating.delete(session.key);
        }
      })();

      this.setConsolidationLock(session.key, promise);
      this._consolidation_tasks.add(promise);
      promise.finally(() => {
        this._consolidation_tasks.delete(promise);
        this.clearConsolidationLock(session.key, promise);
      });
    }

    const initialMessages = this.context.buildMessages({
      history: session.getHistory(this.memoryWindow),
      currentMessage: msg.content,
      channel: msg.channel,
      chat_id: msg.chatId,
      media: msg.media,
      platformChanged,
      previousChannel: previousChannel || undefined,
      previousChatId: previousChatId || undefined,
    });

    const [finalContent, toolsUsed] = await this.runAgentLoop(initialMessages);
    const content = finalContent ?? "I've completed processing but have no response to give.";

    session.addMessage("user", msg.content);
    session.addMessage("assistant", content, { tools_used: toolsUsed.length ? toolsUsed : undefined });
    session.metadata.last_channel = msg.channel;
    session.metadata.last_chat_id = msg.chatId;
    this.sessions.save(session);

    if (messageTool instanceof MessageTool && messageTool.hasSentInTurn) {
      return null;
    }

    return {
      channel: msg.channel,
      chatId: msg.chatId,
      content,
      metadata: msg.metadata ?? {},
    };
  }

  async consolidateMemory(session: Session, archiveAll = false): Promise<boolean> {
    return new MemoryStore(this.workspace).consolidate(session, this.provider, this.model, {
      archive_all: archiveAll,
      memory_window: this.memoryWindow,
    });
  }
}
