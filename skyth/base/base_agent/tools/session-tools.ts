import { BaseTool } from "@/base/tool";
import type { SessionManager } from "@/session/manager";
import type { MemoryStore } from "@/base/base_agent/memory/store";
import { buildCompactMergeSummary, formatSessionList, searchSessionMessages, validateSessionKey } from "@/base/base_agent/tools/session_tool_helpers";

export class SessionBranchTool extends BaseTool {
  constructor(private sessions: SessionManager) {
    super();
  }

  get name(): string {
    return "session_branch";
  }

  get description(): string {
    return "Show the current session graph, visualizing relationships between sessions across channels.";
  }

  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {},
    };
  }

  async execute(): Promise<string> {
    return this.sessions.graph.visualize();
  }
}

export class SessionMergeTool extends BaseTool {
  constructor(private sessions: SessionManager, private currentKeyFn: () => string) {
    super();
  }

  get name(): string {
    return "session_merge";
  }

  get description(): string {
    return "Manually merge another session's context into the current session. Use this to pull context from another channel into the current conversation.";
  }

  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        source: { type: "string", description: "Source session key to merge from (e.g., 'discord:12345')" },
        mode: { type: "string", enum: ["compact", "full"], description: "Merge mode: 'compact' (summarizes source) or 'full' (includes all messages)", default: "compact" },
      },
      required: ["source"],
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const sourceKey = String(params.source);
    const mode = params.mode === "full" ? "full" : "compact";
    const targetKey = this.currentKeyFn();

    const keyError = validateSessionKey(sourceKey);
    if (keyError) return keyError;

    if (sourceKey === targetKey) {
      return "Error: Cannot merge a session into itself.";
    }

    const currentKeys = this.sessions.graph.getSessionKeys();
    if (!currentKeys.includes(sourceKey)) {
      return `Error: Session '${sourceKey}' not found. Available sessions: ${currentKeys.join(", ") || "none"}`;
    }

    const sourceSession = this.sessions.getOrCreate(sourceKey);
    const targetSession = this.sessions.getOrCreate(targetKey);
    const messageCount = sourceSession.messages.length;

    if (messageCount === 0) {
      return `Error: Session '${sourceKey}' has no messages to merge.`;
    }

    if (mode === "full") {
      const sourceMessages = sourceSession.getHistory().map(m => ({
        ...m,
        _mergedFrom: sourceKey,
      }));
      targetSession.messages.unshift(...sourceMessages);
    } else {
      const summary = buildCompactMergeSummary(sourceKey, sourceSession.messages);
      targetSession.messages.unshift({
        role: "system",
        content: summary,
        timestamp: new Date().toISOString(),
        _mergedFrom: sourceKey,
      });
    }

    this.sessions.save(targetSession);
    this.sessions.graph.merge(sourceKey, targetKey, mode, messageCount);
    this.sessions.graph.saveAll();

    return `Merged ${messageCount} messages from '${sourceKey}' into current session (mode: ${mode}).`;
  }
}

export class SessionLinkTool extends BaseTool {
  constructor(private sessions: SessionManager, private currentKeyFn: () => string) {
    super();
  }

  get name(): string {
    return "session_link";
  }

  get description(): string {
    return "Link two sessions together without merging their messages. Creates a relationship in the session graph.";
  }

  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        target: { type: "string", description: "Target session key to link with (e.g., 'telegram:67890')" },
      },
      required: ["target"],
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const targetKey = String(params.target);
    const currentKey = this.currentKeyFn();

    const keyError = validateSessionKey(targetKey);
    if (keyError) return keyError;

    const currentKeys = this.sessions.graph.getSessionKeys();
    if (!currentKeys.includes(targetKey)) {
      return `Error: Session '${targetKey}' not found. Available sessions: ${currentKeys.join(", ") || "none"}`;
    }

    this.sessions.graph.link(currentKey, targetKey);
    this.sessions.graph.saveAll();

    return `Linked current session with '${targetKey}'.`;
  }
}

export class SessionSearchTool extends BaseTool {
  constructor(private sessions: SessionManager, private memory: MemoryStore) {
    super();
  }

  get name(): string {
    return "session_search";
  }

  get description(): string {
    return "Search across all sessions in the graph for messages matching a query.";
  }

  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Maximum number of results", default: 5 },
      },
      required: ["query"],
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const query = String(params.query);
    const limit = Number(params.limit) || 5;

    const sessions = this.sessions.graph.getSessionList();
    const results = searchSessionMessages(
      sessions.map(({ key }) => ({ key, messages: this.sessions.getOrCreate(key).messages })),
      query,
      limit,
    );

    if (results.length === 0) {
      return `No results found for '${query}' across ${sessions.length} sessions.`;
    }

    const output = results.slice(0, limit).map(r => 
      `[${r.session}] ${r.role}: ${r.content}`
    ).join("\n");

    return `Found ${results.length} results:\n\n${output}`;
  }
}

export class SessionPurgeTool extends BaseTool {
  constructor(private sessions: SessionManager) {
    super();
  }

  get name(): string {
    return "session_purge";
  }

  get description(): string {
    return "Clear all session history and start fresh. This removes all messages and session graph relationships.";
  }

  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        force: { type: "boolean", description: "Skip confirmation", default: false },
      },
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const force = Boolean(params.force);

    if (!force) {
      return "Warning: This will delete all session history. Add 'force: true' to confirm.";
    }

    this.sessions.graph.clear();
    this.sessions.graph.saveAll();

    return "All sessions purged. Starting fresh.";
  }
}

export class SessionRebaseTool extends BaseTool {
  constructor(private sessions: SessionManager, private currentKeyFn: () => string) {
    super();
  }

  get name(): string {
    return "session_rebase";
  }

  get description(): string {
    return "Rebase current session on another session's history. Like git rebase - replays current messages on top of source session.";
  }

  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        source: { type: "string", description: "Source session key to rebase onto (e.g., 'discord:12345')" },
      },
      required: ["source"],
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const sourceKey = String(params.source);
    const targetKey = this.currentKeyFn();

    const keyError = validateSessionKey(sourceKey);
    if (keyError) return keyError;

    const currentKeys = this.sessions.graph.getSessionKeys();
    if (!currentKeys.includes(sourceKey)) {
      return `Error: Session '${sourceKey}' not found.`;
    }

    const sourceSession = this.sessions.getOrCreate(sourceKey);
    const targetSession = this.sessions.getOrCreate(targetKey);
    const sourceMessages = sourceSession.getHistory();
    const currentMessages = [...targetSession.messages];

    targetSession.messages = [...sourceMessages, ...currentMessages];
    this.sessions.save(targetSession);

    this.sessions.graph.merge(sourceKey, targetKey, "full", sourceSession.messages.length);
    this.sessions.graph.saveAll();

    return `Rebased current session on '${sourceKey}' with ${sourceSession.messages.length} messages.`;
  }
}

export class SessionListTool extends BaseTool {
  constructor(private sessions: SessionManager) {
    super();
  }

  get name(): string {
    return "session_list";
  }

  get description(): string {
    return "List all sessions with their token counts. Use this to see how much context each channel's session has.";
  }

  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {},
    };
  }

  async execute(): Promise<string> {
    const sessions = this.sessions.graph.getSessionList();
    const stats = Object.fromEntries(sessions.map(({ key }) => {
      const session = this.sessions.getOrCreate(key);
      return [key, { messageCount: session.messages.length, tokenCount: session.estimateTokenCount() }];
    }));
    return formatSessionList(sessions, stats);
  }
}

export class SessionReadTool extends BaseTool {
  constructor(private sessions: SessionManager) {
    super();
  }

  get name(): string {
    return "session_read";
  }

  get description(): string {
    return "Read full context from another session without merging. Useful to check what happened on another channel.";
  }

  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        session: { type: "string", description: "Session key to read (e.g., 'discord:12345')" },
        limit: { type: "number", description: "Maximum number of recent messages to show", default: 10 },
      },
      required: ["session"],
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const sessionKey = String(params.session);
    const limit = Number(params.limit) || 10;

    const keyError = validateSessionKey(sessionKey);
    if (keyError) return keyError;

    const session = this.sessions.getOrCreate(sessionKey);
    const messages = session.messages.slice(-limit);

    if (messages.length === 0) {
      return `Session '${sessionKey}' is empty.`;
    }

    const lines: string[] = [`=== Session: ${sessionKey} ===`, ""];
    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      lines.push(`[${msg.role}] ${content.slice(0, 300)}${content.length > 300 ? "..." : ""}`);
      lines.push("");
    }

    return lines.join("\n");
  }
}
