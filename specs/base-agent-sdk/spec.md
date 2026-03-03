# Base Agent + Skyth Agent SDK Specification

**Status:** Implementation In Progress
**Date:** 2026-03-02
**Based on:** `legacy/.trash/spec/phase-2/agent-architecture.md`, `legacy/.trash/spec/arch.md`

---

## Overview

Decompose the monolithic generalist agent (`skyth/agents/generalist_agent/`) into a modular **baseAgent** runtime and a developer-facing **agent-sdk**. This enables agents to be defined declaratively with minimal code. Each agent is self-contained (tools, pipelines, apps, MCPs) and can create its own subagents.

The current generalist agent is bloated -- `loop.ts` alone is ~600 lines containing agent loop execution, cross-channel session merging, sticky bridge logic, onboarding/bootstrap, memory consolidation, message sanitization, tool context management, and hard-coded tool registrations. All of this must be decomposed into focused, composable modules.

---

## Directory Structure

```
skyth/
|-- base/                               # Core runtime (refactored from generalist)
|   |-- base_agent/
|       |-- index.ts                        # Public exports
|       |-- runtime.ts                      # Runtime orchestrator (wiring + coordination)
|       |-- lifecycle.ts                    # init, start, stop, destroy
|       |-- types.ts                        # Shared types (AgentConfig, AgentState, etc.)
|       |-- runtime/
|       |   |-- message_processor.ts        # Turn orchestration for inbound messages
|       |   |-- agent_loop_runner.ts        # LLM call -> tool exec -> repeat loop
|       |   |-- policies.ts                 # Output and priority policy helpers
|       |   |-- commands.ts                 # Slash-command handlers (/new, /help)
|       |   |-- memory_scheduler.ts         # Consolidation scheduling
|       |   +-- types.ts                    # Runtime context interfaces
|       |-- context/
|       |   |-- builder.ts                  # System prompt & message assembly
|       |   |-- identity.ts                 # Identity/persona from IDENTITY.md, USER.md, SOUL.md
|       |   |-- platform.ts                 # Platform-specific output adaptation
|       |   +-- tone.ts                     # Tone mirroring logic
|       |-- memory/
|       |   |-- store.ts                    # Memory interface + SQLite backend
|       |   |-- consolidation.ts            # Background memory consolidation
|       |   +-- mental_image.ts             # Behavioral observation tracking
|       |-- session/
|       |   |-- handler.ts                  # Session get/create/save/clear
|       |   |-- merge.ts                    # Cross-channel merge routing (uses LLMProvider for classification)
|       |   |-- switch_merge.ts             # Platform-switch merge decision/execution
|       |   |-- cross_channel.ts            # Context merge text + compaction prompt helpers
|       |   +-- bridge.ts                   # Sticky bridge continuation
|       |-- delegation/
|       |   |-- manager.ts                  # Subagent spawn & lifecycle management
|       |   |-- call_stack.ts              # Circular call prevention
|       |   +-- types.ts                   # Delegation types
|       |-- tools/
|       |   |-- registry.ts                # Auto-discovery ToolRegistry
|       |   |-- loader.ts                  # File scanner (*_tool.ts, *_tool/ dirs)
|       |   |-- metadata.ts               # Header metadata parser (@tool, @author, etc.)
|       |   |-- first_use.ts              # First-use source review (security)
|       |   +-- types.ts                   # ToolMetadata, ToolEntry interfaces
|       |-- skills/
|       |   |-- loader.ts                  # Skill discovery and loading (from generalist_agent/skills.ts)
|       |   +-- types.ts                   # SkillEntry, SkillMeta interfaces
|       +-- onboarding/
|           |-- bootstrap.ts               # BOOTSTRAP.md flow
|           +-- identity_check.ts          # Missing field detection
|
|-- agent/
|   +-- agent.ts                       # Agent namespace: Agent.list(), Agent.get(), Agent.Info
|                                      # (resolves @/agent/agent import used by skyth/tools/)
|
|-- sdks/
|   +-- agent-sdk/
|       |-- index.ts                   # Public API: defineAgent, defineTool, definePipeline
|       |-- define.ts                  # defineAgent() factory
|       |-- tools.ts                   # defineTool() helper
|       |-- pipeline.ts               # definePipeline() helper
|       |-- manifest.ts               # Manifest schema validation
|       |-- permissions.ts            # Global tool access resolution
|       |-- hooks.ts                  # Lifecycle hook types
|       +-- types.ts                  # All SDK types
|
|-- agents/                            # Concrete agents built with SDK
|   |-- generalist_agent/              # NEW generalist (rebuilt on SDK)
|   |   |-- agent_manifest.json
|   |   |-- index.ts                   # defineAgent({...})
|   |   |-- tools/
|   |   |   |-- message_tool.ts
|   |   |   |-- spawn_tool.ts
|   |   |   |-- cron_tool.ts
|   |   |   +-- session_tool/
|   |   |       |-- index.ts
|   |   |       |-- desc.txt
|   |   |       +-- operations.ts
|   |   |-- pipelines/
|   |   |-- apps/
|   |   +-- mcps/
|   +-- system.ts                      # createAgent() entry point
|
+-- tools/                             # Global tools (shared across agents)
```

---

## 1. baseAgent: Modular Runtime

### 1.1 runtime/ -- The Lean Core Loop

The agent runtime loop is isolated in `runtime/agent_loop_runner.ts`. It only does:
1. Build messages (via context module)
2. Call LLM (via provider)
3. Execute tool calls (via tool registry)
4. Repeat until final response or max iterations

`runtime.ts` acts as orchestrator/wiring, while turn-level control flow is handled by `runtime/message_processor.ts`. Other concerns (merging, onboarding, memory, delegation) are in separate composable modules.

```typescript
// Conceptual interface
export class AgentRuntime {
  constructor(config: AgentRuntimeConfig);
  processMessage(msg: InboundMessage, onStream?: StreamCallback): Promise<OutboundMessage | null>;
  destroy(): Promise<void>;
}

export interface AgentRuntimeConfig {
  provider: LLMProvider;
  bus: MessageBus;
  workspace: string;
  model?: string;
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
  modules: {
    context: ContextModule;
    memory: MemoryModule;
    session: SessionModule;
    delegation: DelegationModule;
    tools: ToolModule;
    onboarding?: OnboardingModule;
  };
  hooks?: LifecycleHooks;
}
```

### 1.2 context/ -- Context Building

Split from the current monolithic `ContextBuilder` into focused modules:

- **builder.ts** -- Assembles system prompt and message arrays. Coordinates identity, platform, tone modules.
- **identity.ts** -- Loads and caches identity/persona from IDENTITY.md, USER.md, SOUL.md. Provides `getIdentity()`, `getKnownProfile()`, `extractMarkdownField()`.
- **platform.ts** -- Platform-specific output adaptation (Telegram: concise; CLI: full detail; Discord: medium). Provides `buildPlatformOutputSection(channel)`.
- **tone.ts** -- Tone mirroring logic. Analyzes user message style and returns adaptation hints. Provides `buildToneAdaptationSection(history, currentMessage)`.

### 1.3 memory/ -- Memory System

Split from current `MemoryStore`:

- **store.ts** -- Memory interface and SQLite backend wrapper. Core CRUD: `getMemoryContext()`, `recordEvent()`, `getSessionPrimer()`, `updateMentalImage()`.
- **consolidation.ts** -- Background memory consolidation logic. Manages consolidation locks, schedules, and LLM-based summarization.
- **mental_image.ts** -- Behavioral observation tracking. Maintains running model of user behavior and preferences.

### 1.4 session/ -- Session Management

Split from the session-related logic embedded in `loop.ts`:

- **handler.ts** -- Session get/create/save/clear. Wraps `SessionManager`.
- **merge.ts** -- Cross-channel merge routing. Contains the merge router classification logic, compaction, and cross-channel message building.
- **bridge.ts** -- Sticky bridge continuation. Manages bridge pairs, expiry, and topic reset detection.

### 1.5 delegation/ -- Agent Delegation System

Refactored from current `SubagentManager` + Phase 2 spec concepts:

- **manager.ts** -- Subagent spawn and lifecycle management. Tracks running tasks, announces results.
- **call_stack.ts** -- Circular call prevention. Implements call stack tracking per Phase 2 spec:
  - Agents can call other agents once per execution path
  - Agents cannot call agents that called them
  - 2-level max nesting (Agent -> Subagent)
  - Subagents cannot delegate further
- **types.ts** -- Delegation types (DelegationRequest, TaskResult, CallStackEntry).

### 1.6 tools/ -- Auto-Discovery Tool Registry

See `specs/base-agent-sdk/tool-conventions.md` for full tool auto-discovery specification.

- **registry.ts** -- Auto-discovery tool registry with scope tracking (agent/global/workspace).
- **loader.ts** -- File scanner that finds `*_tool.{ts,py,js,sh,...}` files and `*_tool/` directories.
- **metadata.ts** -- Parses JSDoc-style header metadata from tool files.
- **first_use.ts** -- First-use source review: on first call per session, injects system message with tool source code.
- **types.ts** -- ToolMetadata, ToolEntry, ToolScope interfaces.

### 1.7 skills/ -- Skill Discovery and Loading

Extracted from current `SkillsLoader` in `generalist_agent/skills.ts`:

- **loader.ts** -- Discovers skills from workspace (`skills/`) and builtin (`skyth/skills/`) directories. Loads SKILL.md files, parses frontmatter metadata, checks requirements (binary/env availability), provides `getAlwaysSkills()` for auto-loaded skills, `loadSkillsForContext()` for on-demand loading, and `buildSkillsSummary()` for context injection.
- **types.ts** -- SkillEntry, SkillMeta interfaces.

### 1.8 onboarding/ -- Bootstrap Flow

Extracted from onboarding logic in `loop.ts`:

- **bootstrap.ts** -- BOOTSTRAP.md flow: checks if onboarding is complete, deletes BOOTSTRAP.md when done.
- **identity_check.ts** -- Detects missing identity fields (user_name, assistant_name) and drives onboarding prompts.

---

## 2. sdks/agent-sdk: Developer SDK

### 2.1 defineAgent() -- Agent Factory

The primary SDK function. Takes a declarative config and returns a factory for creating agent runtime instances.

```typescript
import { defineAgent } from "@/sdks/agent-sdk";

export default defineAgent({
  manifest: "./agent_manifest.json",

  // Module configuration
  context: {
    identity: true,
    tone: true,
    platform: true,
    bootstrapFiles: ["AGENTS.md", "SOUL.md", "IDENTITY.md", "USER.md"],
  },

  memory: {
    backend: "sqlite",
    consolidationWindow: 50,
  },

  delegation: {
    maxSubagents: 5,
    maxDepth: 2,
    circularPrevention: true,
  },

  tools: {
    autoDiscover: true,
    globalAccess: true,  // or false -- must delegate to generalist
  },

  hooks: {
    onInit: async (runtime) => { /* ... */ },
    onMessage: async (msg, runtime) => { /* ... */ },
    onToolCall: async (tool, args, runtime) => { /* ... */ },
    onStop: async (runtime) => { /* ... */ },
  },
});
```

### 2.2 defineTool() -- Tool Helper

Helps create tools that conform to naming/metadata conventions.

```typescript
import { defineTool } from "@/sdks/agent-sdk";

export default defineTool({
  name: "lint_tool",
  author: "skyth-team",
  version: "1.0.0",
  description: "Runs project linter on specified files",
  requires: { bins: ["eslint"] },

  parameters: {
    type: "object",
    properties: {
      files: { type: "array", items: { type: "string" } },
      fix: { type: "boolean", description: "Auto-fix issues" },
    },
    required: ["files"],
  },

  async execute(params) {
    // Tool implementation
    return `Linted ${params.files.length} files`;
  },
});
```

### 2.3 definePipeline() -- Pipeline Helper

For tool-chaining workflows.

```typescript
import { definePipeline } from "@/sdks/agent-sdk";

export default definePipeline({
  name: "code_review_pipeline",
  description: "Lint, test, then summarize results",
  steps: [
    { tool: "lint_tool", params: { fix: false } },
    { tool: "test_tool", params: { suite: "unit" } },
    { tool: "summarize_tool", params: { format: "markdown" } },
  ],
  errorStrategy: "stop-on-first",
});
```

### 2.4 manifest.ts -- Manifest Validation

Extends `skyth/core/manifest.ts` with agent-specific manifest fields:

```json
{
  "id": "code_agent",
  "name": "Code Agent",
  "version": "1.0.0",
  "entrypoint": "skyth/agents/code_agent/index.ts",
  "capabilities": ["code_generation", "debugging"],
  "dependencies": [],
  "security": { "sandbox": "required" },
  "global_tools": false,
  "type": "specialized",
  "model_preferences": {
    "primary": "anthropic/claude-sonnet-4",
    "fallback": "openai/gpt-4o"
  },
  "subagents": ["debug", "test"],
  "max_context_tokens": 100000
}
```

### 2.5 permissions.ts -- Global Tool Access

Resolves global tool access for agents:

1. If `global_tools: true` in manifest -> agent's ToolModule includes all global tools directly.
2. If `global_tools: false` (default) -> agent must use `delegate` tool to request generalist to execute global tools on its behalf.
3. `delegate` and `task` tools are ALWAYS available to non-subagent agents (per Phase 2 spec).
4. Subagents have NO delegation tools -- they can only respond to their parent.

---

## 3. Agent Self-Containment

Each agent directory is fully self-contained:

```
agents/{agent_name}/
|-- agent_manifest.json    # Agent metadata and configuration
|-- index.ts               # defineAgent({...}) entry point
|-- tools/                 # Agent-specific tools (*_tool.ts convention)
|-- pipelines/             # Tool-chaining pipelines
|-- apps/                  # UI widgets / specialized tool sets
+-- mcps/                  # MCP server configs
```

Agents discover their own tools automatically via the ToolRegistry loader scanning their `tools/` directory. Global tools from `skyth/tools/` are included only when permitted by the manifest.

---

## 4. Delegation Hierarchy (from Phase 2 Spec)

### Three-Tier Hierarchy

```
                [GENERALIST]
                     |
          -----------------------
          |          |           |
         [A1]       [A2]        [A3]
         Code       Research    Data
         |                        |
        -----                   [SA31]
        |   |
     [SA11] [SA12]
     Debug   Test
```

### Delegation Tools

- **`delegate(agent, task, context_snapshot)`** -- Horizontal agent-to-agent delegation
- **`task(subagent, todo)`** -- Vertical agent-to-subagent spawning
- **`are_we_there_yet(task_id)`** -- Progress checking

### Call Graph Rules

1. Agents can call other agents once per execution path
2. Agents cannot call agents that called them (circular prevention)
3. 2-level max nesting (Agent -> Subagent)
4. Subagents cannot delegate
5. Subagents can request parent to use global tools

### Context Passing

- **Generalist & Agents:** Full context (conversation history, memories, session metadata)
- **Subagents:** Minimal context (todo, relevant context only, limited tools)

---

## 5. Migration Path

### Step 0: Create Agent Namespace
Create `skyth/agent/agent.ts` to resolve the existing `@/agent/agent` import gap used by `skyth/tools/task.ts`, `skyth/tools/tool.ts`, `skyth/tools/registry.ts`, and `skyth/tools/truncation.ts`. This file provides the `Agent` namespace with `Agent.list()`, `Agent.get()`, and `Agent.Info`.

### Step 1: Create base_agent
Move generalist agent code to `skyth/base/base_agent/`, decompose into modules.

### Step 2: Create agent-sdk
Build `defineAgent`/`defineTool` API on top of baseAgent modules.

### Step 3: Rebuild generalist
Create new `skyth/agents/generalist_agent/` using the SDK, proving the SDK works.

**Core tools migration:** The fundamental tools (`filesystem.ts`: read/write/edit/list_dir, `shell.ts`: exec, `web.ts`: web_fetch) become **global tools** in `skyth/tools/` since they are shared across all agents. Agent-specific tools (`message`, `spawn`, `cron`, `session`) stay in the generalist agent's `tools/` directory.

### Step 4: Delete old code
Remove any remaining references to the old generalist agent structure.

---

## References

- `legacy/.trash/spec/phase-2/agent-architecture.md` -- Delegation hierarchy, call graph rules
- `legacy/.trash/spec/arch.md` -- Overall architecture vision
- `legacy/.trash/spec/spec.md` -- Technical specifications index
- `legacy/.trash/spec/components.md` -- Component standards (no emoji)
- `AGENTS.md` -- Repository-wide operating rules

---

_Date: 2026-03-02_
_Specification Version: 1.0_
