# Base Agent + SDK Architecture Details

**Status:** Planning Complete
**Date:** 2026-03-02
**Parent Spec:** `specs/base-agent-sdk/spec.md`

---

## Module Composition Model

The baseAgent runtime composes independent modules via dependency injection. Each module handles one concern and exposes a clean interface.

```
+---------------------------------------------------------------+
|                      AgentRuntime                              |
|  +----------------------------------------------------------+ |
|  |  processMessage(msg) -> OutboundMessage                   | |
|  |                                                           | |
|  |  1. SessionModule.getOrCreate(key)                        | |
|  |  2. OnboardingModule?.check(session)                      | |
|  |  3. SessionModule.handleMerge(msg, session)               | |
|  |  4. MemoryModule.updateMentalImage(msg)                   | |
|  |  5. ContextModule.buildMessages(session, msg)             | |
|  |  6. runLoop(messages) -> [content, tools, reasoning]      | |
|  |  7. SessionModule.save(session)                           | |
|  |  8. MemoryModule.scheduleConsolidation(session)           | |
|  +----------------------------------------------------------+ |
+---------------------------------------------------------------+
         |          |          |           |           |
    ContextModule  MemoryModule  SessionModule  DelegationModule  ToolModule
```

---

## Module Interfaces

### ContextModule

```typescript
interface ContextModule {
  buildSystemPrompt(params: {
    toolNames?: string[];
    userLocation?: string;
    skillNames?: string[];
  }): string;

  buildMessages(params: {
    history: Array<Record<string, any>>;
    currentMessage: string;
    channel: string;
    chatId: string;
    media?: string[];
    toolNames?: string[];
    userLocation?: string;
    sessionPrimer?: string;
    platformChanged?: boolean;
    previousChannel?: string;
    enabledChannels?: string[];
    channelTargets?: Map<string, { channel: string; chatId: string }>;
  }): Array<Record<string, any>>;

  addAssistantMessage(
    messages: Array<Record<string, any>>,
    content: string | null,
    toolCalls: Array<Record<string, any>>,
    reasoningContent?: string | null,
  ): Array<Record<string, any>>;

  addToolResult(
    messages: Array<Record<string, any>>,
    toolCallId: string,
    name: string,
    result: string,
  ): Array<Record<string, any>>;
}
```

### MemoryModule

```typescript
interface MemoryModule {
  getMemoryContext(): string;
  recordEvent(event: MemoryEventRecord): void;
  getSessionPrimer(sessionKey: string, limit?: number): string;
  updateMentalImage(observation: MentalImageObservation): void;
  consolidate(session: Session, provider: LLMProvider, model: string, opts: ConsolidationOpts): Promise<boolean>;
  scheduleConsolidation(session: Session): void;
}
```

### SessionModule

```typescript
interface SessionModule {
  getOrCreate(key: string): Session;
  save(session: Session): void;
  invalidate(key: string): void;
  handleMerge(params: {
    msg: InboundMessage;
    session: Session;
    previousChannel?: string;
    previousChatId?: string;
    platformChanged: boolean;
    provider: LLMProvider;  // Required for MergeRouter classification
    model: string;
  }): Promise<void>;
  handleStickyBridge(sourceKey: string, targetKey: string, message: string): boolean;
  consumePendingMerge(session: Session, targetKey: string, message: string): boolean;
}
```

### DelegationModule

```typescript
interface DelegationModule {
  spawn(params: {
    task: string;
    label?: string;
    originChannel: string;
    originChatId: string;
  }): Promise<string>;

  canDelegate(callerId: string, targetId: string): boolean;
  getCallStack(): string[];
  pushCallStack(agentId: string): void;
  popCallStack(): void;

  get runningCount(): number;
}
```

### ToolModule

```typescript
interface ToolModule {
  discover(params: {
    globalDir: string;
    agentDir?: string;
    workspaceDir?: string;
  }): Promise<DiscoveryResult>;

  register(tool: ToolEntry, scope: ToolScope): void;
  unregister(name: string): void;
  get(name: string): ToolEntry | undefined;
  has(name: string): boolean;
  getDefinitions(): Array<Record<string, any>>;
  execute(name: string, params: Record<string, any>): Promise<string>;
  checkFirstUse(name: string, sessionKey: string): string | null;

  get toolNames(): string[];
}
```

### OnboardingModule

```typescript
interface OnboardingModule {
  check(): { bootstrapPresent: boolean; missingFields: string[] };
  completeIfReady(): void;
  shouldForceIdentityToolUse(content: string): boolean;
}
```

### SkillsModule

```typescript
interface SkillsModule {
  listSkills(filterUnavailable?: boolean): SkillEntry[];
  loadSkill(name: string): string | undefined;
  loadSkillsForContext(skillNames: string[]): string;
  buildSkillsSummary(): string;
  getAlwaysSkills(): string[];
  getSkillMetadata(name: string): SkillMeta;
}
```

### LifecycleHooks

```typescript
interface LifecycleHooks {
  onInit?: (runtime: AgentRuntime) => Promise<void>;
  onStart?: (runtime: AgentRuntime) => Promise<void>;
  onMessage?: (msg: InboundMessage, runtime: AgentRuntime) => Promise<void>;
  onToolCall?: (tool: string, args: Record<string, any>, runtime: AgentRuntime) => Promise<void>;
  onResponse?: (content: string, runtime: AgentRuntime) => Promise<void>;
  onStop?: (runtime: AgentRuntime) => Promise<void>;
  onDestroy?: (runtime: AgentRuntime) => Promise<void>;
}
```

---

## Call Stack Tracking (Circular Prevention)

From Phase 2 spec (`legacy/.trash/spec/phase-2/agent-architecture.md`):

```typescript
class CallStack {
  private stack: string[] = [];

  canCall(caller: string, callee: string): boolean {
    // Get caller's position in stack
    const callerIndex = this.stack.indexOf(caller);
    if (callerIndex === -1) return false;

    // Check if callee appears BEFORE caller (circular)
    const calleeInHistory = this.stack.slice(0, callerIndex).includes(callee);
    if (calleeInHistory) {
      throw new CircularCallError(
        `${caller} cannot call ${callee} (circular reference detected)`
      );
    }
    return true;
  }

  push(agent: string): void {
    this.stack.push(agent);
  }

  pop(): void {
    this.stack.pop();
  }

  get depth(): number {
    return this.stack.length;
  }
}
```

Rules enforced:
- Max depth of 2 (Agent -> Subagent)
- No circular calls (A -> B -> A forbidden)
- Subagents cannot push to call stack (no delegation)

---

## SDK defineAgent() Flow

```
defineAgent(config)
    |
    v
Validate manifest (manifest.ts)
    |
    v
Resolve permissions (permissions.ts)
    |
    v
Create module instances:
    - ContextModule (from baseAgent/context/)
    - MemoryModule (from baseAgent/memory/)
    - SessionModule (from baseAgent/session/)
    - DelegationModule (from baseAgent/delegation/)
    - ToolModule (from baseAgent/tools/)
    - OnboardingModule (from baseAgent/onboarding/) [optional]
    |
    v
Bind lifecycle hooks (hooks.ts)
    |
    v
Return AgentFactory:
    factory.create(params) -> AgentRuntime
```

---

## Global Tool Access Flow

```
Agent calls tool
    |
    v
Is tool in agent's ToolModule?
    |-- YES --> Execute directly
    |-- NO  --> Is global_tools: true in manifest?
                    |-- YES --> Execute directly (global tools loaded)
                    |-- NO  --> Agent must use delegate() tool
                                to request generalist execution
```

---

## Agent Discovery Flow

```
AgentRegistry.discoverAgents(workspaceRoot)
    |
    v
Scan skyth/agents/ for agent_manifest.json files
    |
    v
For each manifest:
    1. Validate manifest schema
    2. Register agent in registry
    3. Discover agent-specific tools in agents/{name}/tools/
    |
    v
Registry exposes:
    - Agent.list() -> AgentInfo[]
    - Agent.get(id) -> AgentInfo | undefined
```

---

_Date: 2026-03-02_
