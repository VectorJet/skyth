import { ContextBuilder } from "@/agents/generalist_agent/context";
import { MemoryStore } from "@/agents/generalist_agent/memory";
import { ToolRegistry } from "@/agents/generalist_agent/tools/registry";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { MessageBus } from "@/agents/../bus/queue";
import { sessionKey, type InboundMessage, type OutboundMessage } from "@/agents/../bus/events";
import { eventLine, type EventKind } from "@/agents/../logging/events";
import { LLMProvider, type StreamCallback } from "@/agents/../providers/base";
import { Session, SessionManager, type SessionMessage } from "@/agents/../session/manager";
import { ReadFileTool, WriteFileTool, EditFileTool, ListDirTool } from "@/agents/generalist_agent/tools/filesystem";
import { ExecTool } from "@/agents/generalist_agent/tools/shell";
import { WebFetchTool } from "@/agents/generalist_agent/tools/web";
import { MessageTool, type MessageToolSendRecord } from "@/agents/generalist_agent/tools/message";
import { SpawnTool } from "@/agents/generalist_agent/tools/spawn";
import { SubagentManager } from "@/agents/generalist_agent/subagent";
import { CronTool } from "@/agents/generalist_agent/tools/cron";
import { CronService } from "@/agents/../cron/service";
import { registerRuntimeTools } from "@/agents/../registries/tool_registry";
import { AgentRegistry } from "@/agents/../registries/agent_registry";
import { SessionBranchTool, SessionMergeTool, SessionLinkTool, SessionSearchTool, SessionPurgeTool, SessionRebaseTool, SessionListTool, SessionReadTool } from "@/agents/generalist_agent/tools/session-tools";
import { MergeRouter, isExplicitCrossChannelRequest } from "@/agents/../session/router";

const MERGE_MESSAGE_COUNT = 5;

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
  private lastGlobalChannel = "";
  private lastGlobalChatId = "";
  private mergeRouter: MergeRouter;
  private autoMergeOnSwitch: boolean;
  private stickyBridgePair = "";
  private stickyBridgeRemaining = 0;
  private stickyBridgeExpiresAt = 0;
  private stickyMergeSwitches: number;
  private stickyMergeTtlMs: number;
  private stickyMergeConfidence: number;

  readonly enabledChannels: string[];
  private channelTargets = new Map<string, { channel: string; chatId: string }>();
  private outboundHandoffHints = new Map<string, {
    sourceKey: string;
    sourceChannel: string;
    sourceChatId: string;
    expiresAt: number;
  }>();

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
    exec_timeout?: number;
    restrict_to_workspace?: boolean;
    cron_service?: CronService;
    enable_global_tools?: boolean;
    router_model?: string;
    enabled_channels?: string[];
    session_graph_config?: {
      auto_merge_on_switch?: boolean;
      persist_to_disk?: boolean;
      max_switch_history?: number;
      router_model?: string;
      router_cache_ttl_ms?: number;
      router_cache_max_entries?: number;
      router_max_source_messages?: number;
      router_max_target_messages?: number;
      router_snippet_chars?: number;
      sticky_merge_switches?: number;
      sticky_merge_ttl_ms?: number;
      sticky_merge_confidence?: number;
      model_context_window?: number;
    };
  }) {
    this.bus = params.bus;
    this.provider = params.provider;
    this.workspace = params.workspace;
    this.model = params.model ?? params.provider.getDefaultModel();
    this.maxIterations = params.max_iterations ?? 200;
    this.temperature = params.temperature ?? 0.7;
    this.maxTokens = params.max_tokens ?? 4096;
    this.memoryWindow = params.memory_window ?? 50;
    this.context = new ContextBuilder(this.workspace);
    this.sessions = params.session_manager ?? new SessionManager(params.workspace, params.session_graph_config);
    this.tools = new ToolRegistry();
    this.memory = new MemoryStore(this.workspace);
    this.subagents = new SubagentManager({
      provider: this.provider,
      workspace: this.workspace,
      bus: this.bus,
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      exec_timeout: params.exec_timeout,
      restrict_to_workspace: params.restrict_to_workspace,
    });
    this.restrictToWorkspace = Boolean(params.restrict_to_workspace);
    this.enabledChannels = params.enabled_channels ?? [];
    this.autoMergeOnSwitch = params.session_graph_config?.auto_merge_on_switch ?? true;
    const routerModel =
      params.router_model?.trim()
      || params.session_graph_config?.router_model?.trim()
      || this.model;
    this.mergeRouter = new MergeRouter(this.provider, routerModel, {
      cacheTtlMs: params.session_graph_config?.router_cache_ttl_ms,
      cacheMaxEntries: params.session_graph_config?.router_cache_max_entries,
      maxSourceMessages: params.session_graph_config?.router_max_source_messages,
      maxTargetMessages: params.session_graph_config?.router_max_target_messages,
      maxSnippetChars: params.session_graph_config?.router_snippet_chars,
    });
    this.stickyMergeSwitches = Math.max(0, Number(params.session_graph_config?.sticky_merge_switches ?? 3));
    this.stickyMergeTtlMs = Math.max(1000, Number(params.session_graph_config?.sticky_merge_ttl_ms ?? 30 * 60 * 1000));
    this.stickyMergeConfidence = Math.min(1, Math.max(0, Number(params.session_graph_config?.sticky_merge_confidence ?? 0.75)));

    const allowedDir = this.restrictToWorkspace ? this.workspace : undefined;
    this.tools.register(new ReadFileTool(this.workspace, allowedDir), "agent");
    this.tools.register(new WriteFileTool(this.workspace, allowedDir), "agent");
    this.tools.register(new EditFileTool(this.workspace, allowedDir), "agent");
    this.tools.register(new ListDirTool(this.workspace, allowedDir), "agent");
    this.tools.register(new ExecTool(params.exec_timeout ?? 60, this.workspace, undefined, this.restrictToWorkspace), "agent");
    this.tools.register(new WebFetchTool(), "agent");
    this.tools.register(new MessageTool(this.bus.publishOutbound.bind(this.bus)), "agent");
    this.tools.register(new SpawnTool(this.subagents), "agent");
    this.tools.register(new SessionBranchTool(this.sessions), "agent");
    const currentKeyFn = () => `${this.toolContextChannel}:${this.toolContextChatId}`;
    this.tools.register(new SessionMergeTool(this.sessions, currentKeyFn), "agent");
    this.tools.register(new SessionLinkTool(this.sessions, currentKeyFn), "agent");
    this.tools.register(new SessionSearchTool(this.sessions, this.memory), "agent");
    this.tools.register(new SessionPurgeTool(this.sessions), "agent");
    this.tools.register(new SessionRebaseTool(this.sessions, currentKeyFn), "agent");
    this.tools.register(new SessionListTool(this.sessions), "agent");
    this.tools.register(new SessionReadTool(this.sessions), "agent");
    if (params.cron_service) this.tools.register(new CronTool(params.cron_service), "agent");

    this.toolsReady = this.initializeRuntimeTools({
      forceGlobalTools: params.enable_global_tools,
      execTimeout: params.exec_timeout ?? 60,
      allowedDir,
    });
  }

  private async initializeRuntimeTools(params: {
    forceGlobalTools?: boolean;
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

  updateChannelTargets(targets: Map<string, { channel: string; chatId: string }>): void {
    this.channelTargets = new Map(
      [...targets].map(([k, v]) => [k, { channel: v.channel, chatId: v.chatId }]),
    );
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

  private noteOutboundHandoff(records: MessageToolSendRecord[]): void {
    if (!records.length) return;
    const expiresAt = Date.now() + this.stickyMergeTtlMs;
    for (const record of records) {
      const sourceChannel = String(record.sourceChannel ?? "").trim();
      const sourceChatId = String(record.sourceChatId ?? "").trim();
      const targetChannel = String(record.targetChannel ?? "").trim();
      const targetChatId = String(record.targetChatId ?? "").trim();
      if (!sourceChannel || !sourceChatId || !targetChannel || !targetChatId) continue;
      if (sourceChannel === targetChannel && sourceChatId === targetChatId) continue;

      const sourceKey = `${sourceChannel}:${sourceChatId}`;
      const targetKey = `${targetChannel}:${targetChatId}`;
      this.outboundHandoffHints.set(targetKey, {
        sourceKey,
        sourceChannel,
        sourceChatId,
        expiresAt,
      });
      this.emit("handoff", "session", "queue", `${sourceKey} -> ${targetKey}`);
      this.channelTargets.set(targetChannel, { channel: targetChannel, chatId: targetChatId });
    }
  }

  private takeOutboundHandoff(targetKey: string): {
    sourceKey: string;
    sourceChannel: string;
    sourceChatId: string;
  } | undefined {
    const entry = this.outboundHandoffHints.get(targetKey);
    if (!entry) return undefined;
    this.outboundHandoffHints.delete(targetKey);
    if (entry.expiresAt <= Date.now()) {
      this.emit("handoff", "session", "expire", `${entry.sourceKey} -> ${targetKey}`);
      return undefined;
    }
    this.emit("handoff", "session", "consume", `${entry.sourceKey} -> ${targetKey}`);
    return {
      sourceKey: entry.sourceKey,
      sourceChannel: entry.sourceChannel,
      sourceChatId: entry.sourceChatId,
    };
  }

  private stripThink(text: string | null): string | null {
    if (!text) return null;
    return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || null;
  }

  private sanitizeOutput(text: string): { content: string; replyToCurrent: boolean } {
    let out = text;
    // Strip <final>...</final> wrapper, keeping inner content
    const finalMatch = out.match(/<final>([\s\S]*?)<\/final>/);
    if (finalMatch) out = finalMatch[1]!;
    // Detect and strip [[reply_to_current]] directive
    const replyToCurrent = /\[\[reply_to_current\]\]/i.test(out);
    out = out.replace(/\[\[reply_to_current\]\]/gi, "");
    // Strip any [[reply_to:...]] variants
    out = out.replace(/\[\[reply_to:[^\]]*\]\]/gi, "");
    // Strip leaked tool call text (model echoing internal format)
    out = out.replace(/^Tool calls?:\s*\S+\([\s\S]*?\)\s*/gm, "");
    out = out.replace(/^Tool result:\s*/gm, "");
    return { content: out.trim(), replyToCurrent };
  }

  private shouldForceIdentityToolUse(content: string): boolean {
    const bootstrapPath = join(this.workspace, "BOOTSTRAP.md");
    if (!existsSync(bootstrapPath)) return false;
    return /\b(call me|call you|you are|you're|youre|your name|my name is|i am|i'm)\b/i.test(content);
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

  private pairKey(a: string, b: string): string {
    return [a, b].sort().join("<->");
  }

  private clearStickyBridge(): void {
    this.stickyBridgePair = "";
    this.stickyBridgeRemaining = 0;
    this.stickyBridgeExpiresAt = 0;
  }

  private activateStickyBridge(sourceKey: string, targetKey: string): void {
    if (this.stickyMergeSwitches <= 0) return;
    this.stickyBridgePair = this.pairKey(sourceKey, targetKey);
    this.stickyBridgeRemaining = this.stickyMergeSwitches;
    this.stickyBridgeExpiresAt = Date.now() + this.stickyMergeTtlMs;
  }

  private isTopicResetMessage(message: string): boolean {
    const normalized = message.trim().toLowerCase();
    if (normalized === "/new") return true;
    return /\b(start (a )?(new|fresh) (topic|chat|conversation)|new topic|different topic|start over|from scratch)\b/i.test(message);
  }

  private shouldUseStickyBridge(sourceKey: string, targetKey: string, currentMessage: string): boolean {
    if (!this.stickyBridgePair) return false;
    if (this.isTopicResetMessage(currentMessage)) {
      this.clearStickyBridge();
      return false;
    }
    if (this.stickyBridgeRemaining <= 0 || this.stickyBridgeExpiresAt <= Date.now()) {
      this.clearStickyBridge();
      return false;
    }
    if (this.stickyBridgePair !== this.pairKey(sourceKey, targetKey)) return false;

    this.stickyBridgeRemaining -= 1;
    if (this.stickyBridgeRemaining <= 0) {
      this.clearStickyBridge();
    }
    return true;
  }

  private consumePendingMergeIfRequested(session: Session, targetKey: string, currentMessage: string): boolean {
    const pending = session.metadata?.pendingMerge as
      | { sourceKey?: string; sourceChannel?: string; timestamp?: number }
      | undefined;
    if (!pending) return false;

    const sourceKey = String(pending.sourceKey ?? "").trim();
    const sourceChannel = String(pending.sourceChannel ?? "").trim();
    if (!sourceKey || !sourceChannel) return false;
    if (!isExplicitCrossChannelRequest(currentMessage, sourceChannel)) return false;

    const sourceSession = this.sessions.getOrCreate(sourceKey);
    if (sourceSession.messages.length === 0) return false;

    const mergedContent = this.buildCrossChannelMessages(
      sourceSession.messages,
      session.messages,
      sourceKey,
      targetKey,
    );
    session.messages.push({
      role: "system",
      content: `[CROSS-CHANNEL CONTEXT: USER-REQUESTED MERGE]\nSource: ${sourceKey}\n${mergedContent}\nInstruction: User explicitly requested cross-channel recall. Use this context as authoritative continuity.`,
      timestamp: new Date().toISOString(),
      _mergeMeta: {
        sourceChannel,
        sourceKey,
        decision: "continue",
      },
    });

    this.sessions.graph.merge(sourceKey, targetKey, "compact", sourceSession.messages.length);
    delete session.metadata.pendingMerge;
    this.sessions.save(session);
    this.sessions.graph.saveAll();
    this.activateStickyBridge(sourceKey, targetKey);
    console.log(`[session-graph] consumed pending merge ${sourceKey} -> ${targetKey} on explicit request`);
    return true;
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
    options?: {
      forceIdentityToolUse?: boolean;
      forceTaskPriority?: boolean;
      onboardingMissing?: Array<"user_name" | "assistant_name">;
    },
    onStream?: StreamCallback,
  ): Promise<[string | null, string[], string | null]> {
    let messages = initialMessages;
    let iteration = 0;
    let finalContent: string | null = null;
    let finalReasoning: string | null = null;
    const toolsUsed: string[] = [];
    const identityWrites = new Set<"user.md" | "identity.md">();
    const recentCallSignatures: string[] = [];
    const LOOP_DETECT_WINDOW = 6;
    const LOOP_DETECT_THRESHOLD = 3;

    while (iteration < this.maxIterations) {
      iteration += 1;
      this.emit("event", "agent", "model", "chat", {}, key);
      const provider = this.provider as any;
      const response: import("@/providers/base").LLMResponse = onStream && typeof provider.streamChat === "function"
        ? await provider.streamChat({
            messages,
            tools: this.tools.getDefinitions(),
            model: this.model,
            temperature: this.temperature,
            max_tokens: this.maxTokens,
            onStream,
          })
        : await this.provider.chat({
            messages,
            tools: this.tools.getDefinitions(),
            model: this.model,
            temperature: this.temperature,
            max_tokens: this.maxTokens,
          });

      if (response.reasoning_content) {
        finalReasoning = response.reasoning_content;
      }

      if (response.tool_calls.length) {
        const toolCallDicts = response.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        }));

        messages = this.context.addAssistantMessage(messages, response.content, toolCallDicts, response.reasoning_content ?? undefined);

        for (const toolCall of response.tool_calls) {
          const sig = `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`;
          recentCallSignatures.push(sig);
          if (recentCallSignatures.length > LOOP_DETECT_WINDOW) recentCallSignatures.shift();
          const repeats = recentCallSignatures.filter((s) => s === sig).length;
          if (repeats >= LOOP_DETECT_THRESHOLD) {
            this.emit("event", "agent", "loop", `detected on ${toolCall.name}`, undefined, key);
            finalContent = response.content ?? "Completed the requested actions.";
            break;
          }

          this.emit("event", "agent", "tool", toolCall.name, {}, key);
          toolsUsed.push(toolCall.name);
          const written = this.isIdentityFileWriteToolCall(toolCall.name, toolCall.arguments);
          if (written) identityWrites.add(written);
          const result = await this.tools.execute(toolCall.name, toolCall.arguments);
          messages = this.context.addToolResult(messages, toolCall.id, toolCall.name, result);
        }
        if (finalContent) break;
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
        if (!candidate) {
          messages.push({
            role: "user",
            content: toolsUsed.length
              ? "Final reply required: summarize completed actions for the user in 1-2 concise sentences. Do not call additional tools unless absolutely required."
              : "Final reply required: provide a concise direct reply to the user now.",
          });
          continue;
        }
        if (options?.onboardingMissing?.length && !this.replyCoversOnboardingMissing(candidate, options.onboardingMissing)) {
          const missing = options.onboardingMissing.join(", ");
          messages.push({
            role: "user",
            content: `Onboarding continuity: required identity fields still missing (${missing}). Reply naturally in your current persona and ask only for the missing field(s). Avoid meta wording like "onboarding incomplete".`,
          });
          continue;
        }
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

    if (!finalContent && toolsUsed.length) {
      finalContent = "Done. Completed the requested updates.";
    }
    return [finalContent, toolsUsed, finalReasoning];
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

  private onboardingMissingFields(): Array<"user_name" | "assistant_name"> {
    const bootstrapPath = join(this.workspace, "BOOTSTRAP.md");
    if (!existsSync(bootstrapPath)) return [];

    const identityPath = join(this.workspace, "IDENTITY.md");
    const userPath = join(this.workspace, "USER.md");
    if (!existsSync(identityPath) || !existsSync(userPath)) {
      return ["user_name", "assistant_name"];
    }

    let identityRaw = "";
    let userRaw = "";
    try {
      identityRaw = readFileSync(identityPath, "utf-8");
      userRaw = readFileSync(userPath, "utf-8");
    } catch {
      return ["user_name", "assistant_name"];
    }

    const userPreferred = this.extractMarkdownField(userRaw, "What to call them")
      ?? this.extractMarkdownField(userRaw, "Name");
    const assistantName = this.extractMarkdownField(identityRaw, "Name");

    const missing: Array<"user_name" | "assistant_name"> = [];
    if (!userPreferred) missing.push("user_name");
    if (!assistantName) missing.push("assistant_name");
    return missing;
  }

  private replyCoversOnboardingMissing(content: string, missing: Array<"user_name" | "assistant_name">): boolean {
    const normalized = content.toLowerCase();
    const asksAssistant = /\b(call me|my name|name be|what should .*name|what should you call me)\b/.test(normalized);
    const asksUser = /\b(call you|your name|what should i call you)\b/.test(normalized);
    for (const field of missing) {
      if (field === "assistant_name" && !asksAssistant) return false;
      if (field === "user_name" && !asksUser) return false;
    }
    return true;
  }

  async processMessage(msg: InboundMessage, overrideSessionKey?: string, onStream?: StreamCallback): Promise<OutboundMessage | null> {
    await this.toolsReady;

    if (msg.channel === "system") {
      const [channel, chatId] = msg.chatId.includes(":") ? msg.chatId.split(":", 2) : ["cli", msg.chatId ?? ""];
      const key = `${channel ?? "cli"}:${chatId ?? ""}`;
      return await this.processMessage({ ...msg, channel: channel ?? "cli", chatId: chatId ?? "" }, key, onStream);
    }

    const key = overrideSessionKey ?? sessionKey(msg);
    const session = this.sessions.getOrCreate(key);
    this.setToolContext(msg.channel, msg.chatId, String(msg.metadata?.message_id ?? "") || undefined);
    const outboundHandoff = this.takeOutboundHandoff(key);

    const statePreviousChannel = this.lastGlobalChannel;
    const statePreviousChatId = this.lastGlobalChatId;
    const previousChannel = outboundHandoff?.sourceChannel ?? statePreviousChannel;
    const previousChatId = outboundHandoff?.sourceChatId ?? statePreviousChatId;
    const platformChanged = outboundHandoff
      ? true
      : Boolean(statePreviousChannel && statePreviousChatId) && (statePreviousChannel !== msg.channel || statePreviousChatId !== msg.chatId);

    if (platformChanged && previousChannel && previousChatId && this.autoMergeOnSwitch) {
      const previousKey = outboundHandoff?.sourceKey ?? `${previousChannel}:${previousChatId}`;
      const previousSession = this.sessions.getOrCreate(previousKey);

      if (previousSession.messages.length > 0) {
        const routerResult = outboundHandoff
          ? { decision: "continue" as const, confidence: 0.99, reason: "Agent cross-channel handoff" }
          : this.shouldUseStickyBridge(previousKey, key, msg.content)
            ? { decision: "continue" as const, confidence: 0.99, reason: "Sticky bridge continuation" }
            : await this.mergeRouter.classify(
              previousSession.messages,
              session.messages,
              msg.content,
            );
        console.log(`[session-graph] router: ${routerResult.decision} (${routerResult.reason})`);

        if (routerResult.decision === "continue") {
          const mergeCheck = outboundHandoff
            ? this.sessions.shouldMerge(previousKey, key, previousSession, session, 0, 0)
            : this.sessions.shouldMerge(previousKey, key, previousSession, session, 0);

          if (mergeCheck.shouldMerge) {
            const compactionCheck = this.sessions.needsCompaction(session, 80);

            if (compactionCheck.needsCompaction) {
              console.log(`[session-graph] target at ${Math.round(compactionCheck.percentUsed)}% - compacting before merge`);
              const compactResult = await this.sessions.compactSession(
                session,
                async (msgs) => {
                  const prompt = this.buildCompactionPrompt(msgs);
                  const response = await this.provider.chat({
                    messages: [{ role: "user", content: prompt }],
                    model: this.model,
                    temperature: 0.3,
                    max_tokens: 2000,
                  });
                  return response.content || "Summary unavailable";
                },
                10,
              );
              if (compactResult.success) {
                console.log(`[session-graph] compacted target from ${compactResult.originalMessages} to ${compactResult.remainingMessages} messages`);
              }
            }

            const mergedContent = this.buildCrossChannelMessages(
              previousSession.messages,
              session.messages,
              previousKey,
              key,
            );
            session.messages.push({
              role: "system",
              content: `[CROSS-CHANNEL CONTEXT: CONFIRMED CONTINUATION]\nSource: ${previousKey}\n${mergedContent}\nInstruction: Treat this as prior conversation context the user is continuing. Use it normally.`,
              timestamp: new Date().toISOString(),
              _mergeMeta: {
                sourceChannel: previousChannel,
                sourceKey: previousKey,
                decision: "continue",
              },
            });

            this.sessions.graph.merge(previousKey, key, "compact", previousSession.messages.length);
            this.sessions.graph.saveAll();
            console.log(`[session-graph] auto-merged ${previousKey} -> ${key}`);
            if (routerResult.confidence >= this.stickyMergeConfidence) {
              this.activateStickyBridge(previousKey, key);
            }
          } else {
            console.log(`[session-graph] skipped merge: ${mergeCheck.reason}`);
          }
        } else if (routerResult.decision === "ambiguous") {
const mergedContent = this.buildCrossChannelMessages(
              previousSession.messages,
              session.messages,
              previousKey,
              key,
            );
            session.messages.push({
              role: "system",
              content: `[CROSS-CHANNEL CONTEXT: CANDIDATE]\nSource: ${previousKey}\n${mergedContent}\nInstruction: This context may be unrelated. DO NOT use it unless the user explicitly indicates continuation. If unclear, ask: "Want me to continue from your ${previousChannel} conversation, or start fresh?"`,
              timestamp: new Date().toISOString(),
              _mergeMeta: {
                sourceChannel: previousChannel,
                sourceKey: previousKey,
                decision: "ambiguous",
              },
            });
          this.sessions.graph.link(previousKey, key);
          this.sessions.graph.saveAll();
          console.log(`[session-graph] ambiguous merge candidate ${previousKey} -> ${key}`);
        } else {
          if (isExplicitCrossChannelRequest(msg.content, previousChannel)) {
            const mergedContent = this.buildCrossChannelMessages(
              previousSession.messages,
              session.messages,
              previousKey,
              key,
            );
            session.messages.push({
              role: "system",
              content: `[CROSS-CHANNEL CONTEXT: USER-REQUESTED]\nSource: ${previousKey}\n${mergedContent}\nInstruction: User referenced cross-channel context explicitly. Prefer this context unless user asks to reset topic.`,
              timestamp: new Date().toISOString(),
              _mergeMeta: {
                sourceChannel: previousChannel,
                sourceKey: previousKey,
                decision: "continue",
              },
            });
            this.sessions.graph.merge(previousKey, key, "compact", previousSession.messages.length);
            this.sessions.graph.saveAll();
            this.activateStickyBridge(previousKey, key);
            console.log(`[session-graph] promoted separate->continue due to explicit cross-channel request ${previousKey} -> ${key}`);
          }
          session.metadata.pendingMerge = {
            sourceKey: previousKey,
            sourceChannel: previousChannel,
            timestamp: Date.now(),
          };
          this.sessions.save(session);
          console.log(`[session-graph] separate topic, stored pending merge from ${previousKey}`);
        }
      }

      this.sessions.graph.recordSwitch(previousChannel, msg.channel);
      this.sessions.graph.saveAll();
    }

    this.consumePendingMergeIfRequested(session, key, msg.content);

    this.lastGlobalChannel = msg.channel;
    this.lastGlobalChatId = msg.chatId;

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
        content: "skyth commands:\n/new - start a new conversation\n/session-branch - show session graph\n/session-search <query> - search across sessions\n/help - show available commands",
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
      enabledChannels: this.enabledChannels,
      channelTargets: this.channelTargets,
    });

    const missingBeforeTurn = this.onboardingMissingFields();
    const [finalContent, toolsUsed, finalReasoning] = await this.runAgentLoop(initialMessages, key, {
      forceIdentityToolUse: this.shouldForceIdentityToolUse(msg.content),
      forceTaskPriority: this.shouldForceTaskPriority(msg.content),
      onboardingMissing: missingBeforeTurn.length ? missingBeforeTurn : undefined,
    }, onStream);
    this.completeBootstrapIfReady();
    const raw = finalContent ?? "I lost the thread for a moment. Say that again and I'll respond directly.";
    const { content, replyToCurrent } = this.sanitizeOutput(raw);

    session.addMessage("user", msg.content);
    session.addMessage("assistant", content, { tools_used: toolsUsed.length ? toolsUsed : undefined, reasoning: finalReasoning ?? undefined });
    session.metadata.last_channel = msg.channel;
    session.metadata.last_chat_id = msg.chatId;
    this.sessions.save(session);

    if (messageTool instanceof MessageTool) {
      this.noteOutboundHandoff(messageTool.consumeTurnSendRecords());
    }

    if (messageTool instanceof MessageTool && messageTool.hasSentInTurn) {
      return null;
    }

    const replyTo = replyToCurrent ? String(msg.metadata?.message_id ?? "") || undefined : undefined;

    return {
      channel: msg.channel,
      chatId: msg.chatId,
      content,
      replyTo,
      metadata: { ...msg.metadata, reasoning: finalReasoning ?? undefined },
    };
  }

  private buildCrossChannelMessages(
    sourceMessages: SessionMessage[],
    targetMessages: SessionMessage[],
    sourceKey: string,
    targetKey: string,
    x: number = 2,
  ): string {
    const sourceCount = Math.min(MERGE_MESSAGE_COUNT, sourceMessages.length);
    const targetCount = Math.min(MERGE_MESSAGE_COUNT - x, targetMessages.length);

    const lines: string[] = ["=== CROSS-CHANNEL CONTEXT ===", ""];

    if (targetCount > 0) {
      lines.push(`--- Current Channel (${targetKey}) ---`);
      const recentTarget = targetMessages.slice(-targetCount);
      for (const msg of recentTarget) {
        const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        lines.push(`[${msg.role}] ${content}`);
      }
      lines.push("");
    }

    lines.push(`--- Previous Channel (${sourceKey}) ---`);
    const recentSource = sourceMessages.slice(-sourceCount);
    for (const msg of recentSource) {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      lines.push(`[${msg.role}] ${content}`);
    }

    lines.push("=== END CROSS-CHANNEL CONTEXT ===");
    return lines.join("\n");
  }

  private buildCompactionPrompt(messages: SessionMessage[]): string {
    const messageTexts = messages.map((m) => {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return `[${m.role}] ${content.slice(0, 500)}`;
    }).join("\n\n");

    return `Summarize the following conversation messages concisely. Focus on:
1. Key topics discussed
2. Important decisions or conclusions
3. Any files or code that was worked on
4. User preferences or important context mentioned

Conversation:
${messageTexts}

Provide a concise summary (2-4 paragraphs) that captures the essential context:`;
  }

  async consolidateMemory(session: Session, archiveAll = false): Promise<boolean> {
    return this.memory.consolidate(session, this.provider, this.model, {
      archive_all: archiveAll,
      memory_window: this.memoryWindow,
    });
  }
}
