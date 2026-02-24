import { ContextBuilder } from "./context";
import { MemoryStore } from "./memory";
import { ToolRegistry } from "./tools/registry";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { MessageBus } from "../../bus/queue";
import { sessionKey, type InboundMessage, type OutboundMessage } from "../../bus/events";
import { eventLine, type EventKind } from "../../logging/events";
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
import { registerRuntimeTools } from "../../registries/tool_registry";
import { AgentRegistry } from "../../registries/agent_registry";

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
  readonly memory: MemoryStore;
  readonly toolsReady: Promise<void>;
  readonly _consolidating = new Set<string>();
  readonly _consolidation_tasks = new Set<Promise<void>>();
  readonly _consolidation_locks = new Map<string, Promise<void>>();
  readonly subagents: SubagentManager;
  readonly restrictToWorkspace: boolean;
  private toolContextChannel = "cli";
  private toolContextChatId = "direct";

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
    enable_global_tools?: boolean;
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
    this.memory = new MemoryStore(this.workspace);
    this.subagents = new SubagentManager({
      provider: this.provider,
      workspace: this.workspace,
      bus: this.bus,
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      brave_api_key: params.brave_api_key,
      exec_timeout: params.exec_timeout,
      restrict_to_workspace: params.restrict_to_workspace,
    });
    this.restrictToWorkspace = Boolean(params.restrict_to_workspace);

    const allowedDir = this.restrictToWorkspace ? this.workspace : undefined;
    this.tools.register(new ReadFileTool(this.workspace, allowedDir), "agent");
    this.tools.register(new WriteFileTool(this.workspace, allowedDir), "agent");
    this.tools.register(new EditFileTool(this.workspace, allowedDir), "agent");
    this.tools.register(new ListDirTool(this.workspace, allowedDir), "agent");
    this.tools.register(new ExecTool(params.exec_timeout ?? 60, this.workspace, undefined, this.restrictToWorkspace), "agent");
    this.tools.register(new WebSearchTool(params.brave_api_key ?? process.env.BRAVE_API_KEY ?? ""), "agent");
    this.tools.register(new WebFetchTool(), "agent");
    this.tools.register(new MessageTool(this.bus.publishOutbound.bind(this.bus)), "agent");
    this.tools.register(new SpawnTool(this.subagents), "agent");
    if (params.cron_service) this.tools.register(new CronTool(params.cron_service), "agent");

    this.toolsReady = this.initializeRuntimeTools({
      forceGlobalTools: params.enable_global_tools,
      braveApiKey: params.brave_api_key ?? process.env.BRAVE_API_KEY ?? "",
      execTimeout: params.exec_timeout ?? 60,
      allowedDir,
    });
  }

  private async initializeRuntimeTools(params: {
    forceGlobalTools?: boolean;
    braveApiKey: string;
    execTimeout: number;
    allowedDir?: string;
  }): Promise<void> {
    let globalToolsAllowed = params.forceGlobalTools;
    if (globalToolsAllowed === undefined) {
      const registry = new AgentRegistry();
      registry.discoverAgents(process.cwd());
      globalToolsAllowed = registry.globalToolsEnabled("generalist_agent");
    }

    const result = await registerRuntimeTools({
      registry: this.tools,
      workspace: this.workspace,
      allowedDir: params.allowedDir,
      execTimeout: params.execTimeout,
      restrictToWorkspace: this.restrictToWorkspace,
      braveApiKey: params.braveApiKey,
      spawnTask: async (task: string, label?: string) => this.subagents.spawn({
        task,
        label,
        originChannel: this.toolContextChannel,
        originChatId: this.toolContextChatId,
      }),
      globalToolsEnabled: Boolean(globalToolsAllowed),
    });

    for (const diag of result.diagnostics) {
      this.emit("event", "tools", "warn", diag);
    }
    this.emit("event", "tools", "status", `global ${String(result.globalTools)}`);
    this.emit("event", "tools", "status", `workspace ${String(result.workspaceTools)}`);
  }

  private emit(
    kind: EventKind,
    scope: string,
    action: string,
    summary = "",
    details?: Record<string, unknown>,
    key?: string,
  ): void {
    console.log(eventLine(kind, scope, action, summary));
    this.memory.recordEvent({
      kind,
      scope,
      action,
      summary,
      details,
      session_key: key,
    });
  }

  private setToolContext(channel: string, chatId: string, messageId?: string): void {
    this.toolContextChannel = channel;
    this.toolContextChatId = chatId;

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

  private shouldForceIdentityToolUse(content: string): boolean {
    const bootstrapPath = join(this.workspace, "BOOTSTRAP.md");
    if (!existsSync(bootstrapPath)) return false;
    return /\b(call me|you are|your name|my name is|i am|i'm)\b/i.test(content);
  }

  private shouldForceTaskPriority(content: string): boolean {
    const normalized = content.trim().toLowerCase();
    if (!normalized) return false;
    const isShortGreeting = /^(hi|hello|hey|yo|sup|what'?s up|good morning|good afternoon|good evening)\b/.test(normalized)
      && normalized.split(/\s+/).length <= 4;
    if (isShortGreeting) return false;
    return /\b(update|write|edit|create|delete|remove|fix|search|look up|lookup|remember|save|store|run|execute|configure|set|copy|commit|pair|authorize|auth|allowlist|read|check|use tool)\b/i.test(content)
      || /\b(call me|you are|your name|my name is|i am|i'm)\b/i.test(content);
  }

  private isLikelyTaskDeferral(content: string | null): boolean {
    if (!content) return false;
    return /\b(let me|get my bearings|set up properly|i(?:'m| am) going to|i(?:'ll| will)\s+(?:update|set|write|fix|run|configure|check|look)|just came online|fresh session|clean slate)\b/i.test(content);
  }

  private isIdentityFileWriteToolCall(name: string, args: Record<string, any>): "user.md" | "identity.md" | null {
    if (name !== "write_file" && name !== "edit_file") return null;
    const rawPath = String(args?.path ?? "").trim().toLowerCase();
    if (!rawPath) return null;
    if (rawPath.endsWith("/user.md") || rawPath === "user.md") return "user.md";
    if (rawPath.endsWith("/identity.md") || rawPath === "identity.md") return "identity.md";
    return null;
  }

  private async runAgentLoop(
    initialMessages: Array<Record<string, any>>,
    key: string,
    options?: { forceIdentityToolUse?: boolean; forceTaskPriority?: boolean },
  ): Promise<[string | null, string[]]> {
    let messages = initialMessages;
    let iteration = 0;
    let finalContent: string | null = null;
    const toolsUsed: string[] = [];
    const identityWrites = new Set<"user.md" | "identity.md">();

    while (iteration < this.maxIterations) {
      iteration += 1;
      this.emit("event", "agent", "model", "chat", "", undefined, key);
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
          this.emit("event", "agent", "tool", toolCall.name, "", undefined, key);
          toolsUsed.push(toolCall.name);
          const written = this.isIdentityFileWriteToolCall(toolCall.name, toolCall.arguments);
          if (written) identityWrites.add(written);
          const result = await this.tools.execute(toolCall.name, toolCall.arguments);
          messages = this.context.addToolResult(messages, toolCall.id, toolCall.name, result);
        }
      } else {
        if (options?.forceIdentityToolUse) {
          const needsUser = !identityWrites.has("user.md");
          const needsIdentity = !identityWrites.has("identity.md");
          if (needsUser || needsIdentity) {
            const targets = [
              needsUser ? "USER.md" : "",
              needsIdentity ? "IDENTITY.md" : "",
            ].filter(Boolean).join(" and ");
            messages.push({
              role: "user",
              content: `Tool enforcement: before final reply, use file tools to update ${targets} using identity details from the latest user message.`,
            });
            continue;
          }
        }
        const candidate = this.stripThink(response.content);
        if (options?.forceTaskPriority && !toolsUsed.length && this.isLikelyTaskDeferral(candidate)) {
          messages.push({
            role: "user",
            content: "Task priority enforcement: complete the requested task actions before replying. Do not announce future work. Execute required tools now, then reply with completed results.",
          });
          continue;
        }
        finalContent = candidate;
        this.emit("event", "agent", "send", finalContent ?? "", undefined, key);
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

  private extractMarkdownField(content: string, label: string): string | undefined {
    const wanted = label.trim().toLowerCase();
    for (const line of content.split(/\r?\n/)) {
      const bullet = line.replace(/^\s*-\s*/, "").trim();
      if (!bullet) continue;
      const normalized = bullet.replace(/\*\*/g, "");
      const idx = normalized.indexOf(":");
      if (idx < 0) continue;
      const key = normalized.slice(0, idx).trim().toLowerCase();
      if (key !== wanted) continue;
      const value = normalized.slice(idx + 1).replace(/\s+/g, " ").trim();
      if (!value || value.startsWith("_(")) return undefined;
      return value;
    }
    return undefined;
  }

  private completeBootstrapIfReady(): void {
    const bootstrapPath = join(this.workspace, "BOOTSTRAP.md");
    if (!existsSync(bootstrapPath)) return;

    const identityPath = join(this.workspace, "IDENTITY.md");
    const userPath = join(this.workspace, "USER.md");
    if (!existsSync(identityPath) || !existsSync(userPath)) return;

    let identityRaw = "";
    let userRaw = "";
    try {
      identityRaw = readFileSync(identityPath, "utf-8");
      userRaw = readFileSync(userPath, "utf-8");
    } catch {
      return;
    }

    const assistantName = this.extractMarkdownField(identityRaw, "Name");
    const userPreferred = this.extractMarkdownField(userRaw, "What to call them")
      ?? this.extractMarkdownField(userRaw, "Name");
    if (!assistantName || !userPreferred) return;

    try {
      unlinkSync(bootstrapPath);
      this.emit("event", "agent", "status", "bootstrap rm");
    } catch {
      // best effort
    }
  }

  async processMessage(msg: InboundMessage, overrideSessionKey?: string): Promise<OutboundMessage | null> {
    await this.toolsReady;

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

    if (msg.senderId !== "heartbeat" && msg.senderId !== "cron") {
      this.memory.updateMentalImage({
        senderId: msg.senderId,
        channel: msg.channel,
        content: msg.content,
        timestampMs: msg.timestamp?.getTime() ?? Date.now(),
      });
    }

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

    this.completeBootstrapIfReady();

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
      toolNames: this.tools.toolNames,
      userLocation: String(msg.metadata?.ip_location ?? ""),
      sessionPrimer: session.messages.length === 0 ? this.memory.getSessionPrimer(key, 10) : "",
      platformChanged,
      previousChannel: previousChannel || undefined,
      previousChatId: previousChatId || undefined,
    });

    const [finalContent, toolsUsed] = await this.runAgentLoop(initialMessages, key, {
      forceIdentityToolUse: this.shouldForceIdentityToolUse(msg.content),
      forceTaskPriority: this.shouldForceTaskPriority(msg.content),
    });
    this.completeBootstrapIfReady();
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
    return this.memory.consolidate(session, this.provider, this.model, {
      archive_all: archiveAll,
      memory_window: this.memoryWindow,
    });
  }
}
