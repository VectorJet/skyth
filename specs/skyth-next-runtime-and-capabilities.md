# Skyth Next Runtime and Capability System

Date: 2026-05-21

## Purpose

This spec captures the agreed Skyth Next direction after reviewing legacy Skyth TypeScript, Quasar v1, `claude-gateway`, and reference harnesses under `refs/`.

Skyth Next should be a TypeScript/Bun agent runtime with a Rust Quasar durability layer. The runtime should be agent-first, gateway-compatible, registry-driven, and proactive about creating useful capabilities without allowing uncontrolled permanent growth.

## Architecture Position

Skyth should use:

- TypeScript/Bun for the core agent runtime, gateway, MCP surface, registries, provider adapters, channels, CLI, tools, skills, pipelines, and capability lifecycle.
- Rust for Quasar: encrypted durable state, IPC, VFS, snapshots, auth, memory/session/event storage, cron, heartbeat, and state-domain ownership.
- Python only as an optional plugin/tool runtime, not as the primary loop.

`refs/harnesses/claude-gateway` is the import baseline for gateway/MCP/channel/capability registry work. Repo-local `quasar/` is the state authority. Legacy Skyth TypeScript remains the UX and behavior reference for sessions, context building, delegation, memory, and user-facing ergonomics.

## Core Runtime

Skyth must have one primary runtime API:

```ts
interface AgentSession {
  run(input: AgentInput, options?: RunOptions): AsyncIterable<RunEvent>;
}
```

CLI, gateway, channels, cron, and tests should all call this API. The gateway must not own the agent loop.

## Threads

Skyth user-facing sessions are called threads.

`session` remains acceptable as:

- a compatibility alias
- a transport-level term for MCP headers, provider sessions, and external APIs
- a UI command label where users already expect it, such as `/session`

The durable Skyth model should use `thread`.

### Thread Scope

Every surface can create and own threads:

- web
- TUI
- Android app
- CLI
- Telegram
- Discord
- WhatsApp
- Slack
- MCP clients
- browser/channel adapters
- cron/background jobs

By default, different surfaces and channels get different active threads. Channel adapters should resolve an inbound message to a thread using a deterministic binding such as:

```text
surface + channel + account/user + chat/room + topic/message scope
```

Examples:

- a Telegram DM has its own default thread
- a Telegram group topic can have a separate thread
- a web UI tab can have a separate thread
- an Android app conversation can have a separate thread
- a TUI session can have a separate thread

Threads may later be merged, handed off, compacted, forked, or switched.

### Thread Graph

Keep the legacy Skyth session graph idea, but rename the model to a thread graph.

Minimum thread relationships:

```ts
type ThreadEdgeKind =
  | "forked_from"
  | "merged_into"
  | "handoff_to"
  | "compacted_into"
  | "continued_from"
  | "linked_to";
```

Quasar should persist:

- thread metadata
- surface/channel bindings
- active thread pointers per surface/channel/user scope
- thread edges
- handoff summaries
- compaction summaries
- merge records
- run/event/message membership

### Thread Tools

Promote the existing gateway thread tools to first-class Skyth tools:

- `thread:read`
- `thread:search`
- `thread:handoff`
- `thread:merge`
- `thread:switch`
- `thread:list`
- `thread:compact`

Compatibility aliases may remain:

- `session:search` -> `thread:search`
- `/session` -> thread switch/list UI
- `sessionId` fields -> accepted but normalized to `threadId` where possible

The gateway should nudge models to use these tools when:

- context is getting long
- a task should continue in a new thread
- relevant prior work exists in another thread
- a user asks to switch sessions
- work is crossing surfaces or channels
- the model needs to inspect history instead of relying on memory capsules

### Channel Commands

Channels may expose native session/thread commands.

Telegram should support `/session` or equivalent controls to:

- list recent threads for the chat/user
- switch active thread
- create a new thread
- compact current thread
- hand off to a new thread
- merge another thread into the current one, where permitted

Other channels should map the same semantics into their own UI conventions.

### Thread Merge Policy

Threads from different surfaces are separate by default, but mergeable.

Merge must:

- preserve original thread identities
- create a `merged_into` edge
- record merge source, target, time, actor, and reason
- preserve audit history
- avoid silently merging users in shared channels
- require approval for cross-user, cross-channel, or security-sensitive merges

For group chats, default to per-user threads when the platform provides user identity. Shared room threads are opt-in.

### Two-Layer Loop

Implement the runtime in two layers.

`AgentRunOrchestrator` owns:

- inbound channel/gateway/CLI input normalization
- thread lookup, active-thread routing, and locking
- Quasar-backed run, step, message, and event persistence
- memory/context prefetch
- compaction scheduling and retry
- model selection/fallback
- cancellation and interruption
- delivery back to the invoking surface
- heartbeat, cron, and resume scheduling
- delegation depth and circular-call enforcement
- lifecycle hooks and audit events

`StepRunner` owns only model/tool iteration:

```ts
while (!done) {
  const request = contextBuilder.build(snapshot);
  const stream = provider.stream(request);
  const step = await collectNormalizedProviderEvents(stream);
  const checkedCalls = await toolPolicy.validate(step.toolCalls);
  const results = await toolExecutor.execute(checkedCalls);
  appendAssistantAndToolResults(step, results);
  done = stopPolicy.shouldStop(step, results);
}
```

The `StepRunner` must not know about Telegram, Claude, browser CEF, MCP transport, Quasar internals, or channel-specific delivery.

### Provider Boundary

Providers expose normalized streaming events:

```ts
interface ModelProvider {
  id: string;
  stream(request: ProviderRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>;
}
```

Provider adapters must not execute tools, mutate sessions, or read channel state.

### Runtime Events

Minimum durable events:

- `turn_start`
- `turn_finish`
- `step_start`
- `step_finish`
- `model_delta`
- `model_complete`
- `tool_call_start`
- `tool_call_result`
- `tool_call_error`
- `compaction_start`
- `compaction_done`
- `warning`
- `usage`
- `cancellation`
- `delegation_start`
- `delegation_finish`

Quasar should become the durable event authority. Gateway-local event stores are compatibility layers only.

### Stop Conditions

Default stop behavior:

- stop on final assistant response with no tool calls
- stop on max step budget
- stop on cancellation/interruption
- stop or compact/retry on context overflow
- disable tools on the final budgeted step
- stop/pause on repeated identical failed tool calls
- pause for user on risky unresolved approval

Recommended defaults:

- general runs: 50 model/tool steps
- subagents: 15 steps
- tool concurrency: opt-in per tool, default serial or low bounded concurrency

## Delegation

Keep legacy Skyth's hierarchy:

```text
generalist -> specialist agent -> subagent
```

Rules:

- max depth enforced centrally
- no circular delegation
- subagents cannot delegate
- subagents receive narrow tool sets
- parent receives a structured result
- long-running child work must be represented as a durable run or scheduled job, not hidden background state

Delegation should be implemented as a capability backed by the orchestrator, not as special provider behavior.

## Capability System

Skyth should expose one capability-management surface instead of separate ad hoc creation tools.

Recommended tools:

- `capability_search`
- `capability_view`
- `capability_manage`
- `capability_test`
- `capability_promote`
- `capability_archive`

`capability_manage` should take:

```ts
type CapabilityKind =
  | "tool"
  | "mcp"
  | "skill"
  | "pipeline"
  | "agent"
  | "prompt"
  | "memory_provider"
  | "channel";
```

Thin aliases such as `skill_manage` or `pipeline_manage` may exist later, but internally they must use the same registry, manifest validation, audit, and promotion system.

### Lifecycle Tiers

Every created capability has a lifecycle:

```text
scratch    run-local, discarded unless promoted
temporary  session/project-local, expires or gets reviewed
candidate  persisted but experimental/untrusted
permanent  validated, approved, and actively maintained
core       bundled/versioned with Skyth
```

Creation should be easy. Permanence should be earned.

Recommended quotas:

```ts
capabilities: {
  scratch: { maxPerRun: 16, ttl: "run" },
  temporary: { maxPerSession: 32, ttlDays: 7 },
  candidate: { maxPerProject: 100, ttlDays: 30 },
  permanent: { maxPerProject: 200, requireApproval: true }
}
```

Also enforce:

- max creations per turn
- max creations per run
- duplicate-name detection
- semantic duplicate detection
- manifest schema validation
- source policy checks
- permission declaration
- smoke tests for promotion
- usage tracking
- curator review
- user pinning

### Promotion Gates

A capability can become permanent only after:

- valid manifest
- valid `.ax` sidecar if present
- declared permissions/security model
- duplicate/conflict check
- successful smoke test or explicit waiver
- usage or user approval signal
- no secret leakage
- audit event written

Permanent tools and MCPs require explicit approval by default.

## Skills Philosophy

Skyth should lean into Hermes' build-local-skills philosophy while keeping OpenClaw-style install/import for ecosystem bootstrap.

Model:

```text
installed skill  = seed knowledge
built skill      = lived procedural memory
promoted skill   = validated reusable capability
bundled skill    = curated distribution artifact
```

Rules:

- Install external skills as read-only upstream artifacts.
- Do not mutate installed upstream skills by default.
- Patch installed skills through local overlays or forks.
- Create project/user-specific skills when workflows repeat.
- Promote proven local skills.
- Archive unused or low-value generated skills.
- Export/share promoted skills only after validation.

Default policy:

```ts
skills: {
  installExternal: true,
  buildLocal: true,
  patchInstalledAsOverlay: true,
  autoCreateTemporary: true,
  autoPromotePermanent: false,
  curatorEnabled: true
}
```

## Proactive Self-Improvement

Self-improvement is a policy layer, not core loop behavior.

Default behavior:

```text
simple task                 no nudge
complex successful task     offer to save skill
repeated workflow           suggest skill or pipeline
missing capability          suggest tool or MCP
user says "remember this"   create or update skill
autonomous mode enabled     create temporary skill after success
```

Recommended config:

```ts
selfImprovement: {
  mode: "off" | "suggest" | "ask" | "proactive" | "auto";
  defaultPersistence: "temporary";
  defaultArtifact: "skill";
  nudgeAfterToolCalls: 10;
  requireUserApprovalForPermanent: true;
  requireUserApprovalForTools: true;
  requireUserApprovalForMcps: true;
  allowCoreCodeEdits: false;
}
```

Skyth should be aggressively experimental and conservative about permanence.

## `.ax` Agent Experience Sidecar

Add a schema-validated `.ax` sidecar next to manifests, skills, tools, pipelines, MCP configs, and agents.

Recommended filename:

```text
agent.ax.json
```

Role:

```text
manifest.json = machine contract
SKILL.md      = procedural instruction
agent.ax.json = agent-facing activation, routing, risk, UX, and lifecycle hints
```

`.ax` must not contain executable code or secrets.

Example:

```json
{
  "schema": "skyth.ax.v1",
  "id": "repo-release-check.ax",
  "target": {
    "kind": "pipeline",
    "id": "repo-release-check"
  },
  "activation": {
    "triggers": [
      "user asks to release",
      "user asks to publish package",
      "before pushing a production branch"
    ],
    "negativeTriggers": [
      "simple git status request",
      "read-only code review"
    ],
    "confidenceThreshold": 0.72
  },
  "context": {
    "summary": "Checks repo state, runs validation, prepares release notes.",
    "loadWhenRelevant": true,
    "maxPromptChars": 1600,
    "requiresFiles": [
      "package.json",
      "CHANGELOG.md"
    ]
  },
  "operation": {
    "defaultMode": "ask",
    "safeModes": ["dry-run", "read-only"],
    "riskyActions": ["publish", "push", "delete-tag"],
    "approvalRequired": ["publish", "push"]
  },
  "handoff": {
    "beforeUse": "Confirm target branch and release type.",
    "afterUse": "Summarize checks, changed files, and next irreversible action."
  },
  "learning": {
    "recordUsage": true,
    "promoteAfterSuccesses": 3,
    "decay": {
      "domain": "devops_release",
      "halfLifeDays": 90
    },
    "patchWhen": [
      "command fails due to missing setup",
      "repo has a different package manager",
      "release process differs by project"
    ]
  }
}
```

Required `.ax` sections:

- `schema`
- `id`
- `target.kind`
- `target.id`

Optional sections:

- `activation`
- `context`
- `operation`
- `handoff`
- `learning`
- `ui`
- `diagnostics`

## Memory

Skyth should support pluggable memory providers, but Quasar should be the primary durable memory authority.

Architecture:

```text
Quasar structured memory
+ bounded prompt capsules
+ memory-provider registry
+ external backend adapters
+ domain-aware decay
+ staged retrieval/reranking
```

Do not make external providers the sole source of truth by default.

Memory records should be structured:

```ts
type MemoryKind =
  | "user_profile"
  | "agent_note"
  | "project_fact"
  | "session_summary"
  | "task_trace"
  | "preference"
  | "capability_usage"
  | "retrieval_document";
```

Prompt capsules:

- `USER`: stable user profile/preferences
- `MEMORY`: operational facts and learned conventions
- `PROJECT`: repo/project-specific facts
- `TASK`: current run/session facts

Recommended defaults:

```ts
memory: {
  enabled: true,
  primary: "quasar",
  mirrors: [],
  retrievalProviders: ["quasar"],
  writePolicy: "primary-only",
  capsules: {
    user: { charLimit: 1500 },
    agent: { charLimit: 2500 },
    project: { charLimit: 2500 },
    task: { charLimit: 2000 }
  },
  nudgeIntervalTurns: 10,
  flushMinTurns: 6
}
```

Support commands:

```text
skyth memory list
skyth memory use <provider>
skyth memory status
skyth memory sync
```

Provider interface:

```ts
interface MemoryProvider {
  id: string;
  search(query: MemoryQuery): Promise<MemoryHit[]>;
  write(records: MemoryRecord[]): Promise<void>;
  prefetch?(turn: TurnInput): Promise<MemoryHit[]>;
  syncTurn?(turn: TurnRecord): Promise<void>;
  summarize?(records: MemoryRecord[]): Promise<MemoryRecord[]>;
  shutdown?(): Promise<void>;
}
```

### Retrieval Policy

Based on the DRAG/Lightcone paper in `~/dev/experiments/drag`, avoid one fused retrieval score for heterogeneous signals. Use staged retrieval:

```text
1. semantic candidate retrieval
2. scope/user/project/session filtering
3. domain-aware decay
4. salience/usefulness reranking
5. bounded capsule construction
```

Use domain-aware differential decay:

```text
volatile facts       decay fast
project conventions  decay slowly
user preferences     decay very slowly
tool failures        decay unless repeated
skills/pipelines     strengthen with successful reuse
```

## Gateway Import Direction

Import `refs/harnesses/claude-gateway/mcp-gateway` into Skyth as a baseline, but normalize it before treating it as core:

1. Copy into `skyth/gateway/` or an equivalent Skyth-owned package.
2. Preserve registry/channel/MCP code first.
3. Convert imports to `@/`.
4. Split large files before adding behavior.
5. Replace Claude-specific names with provider-neutral names while keeping compatibility aliases.
6. Move durable stores behind Quasar adapters.
7. Keep gateway routes as wrappers around `AgentSession.run`.
8. Preserve ChatGPT/Claude-compatible routes where useful as compatibility surfaces.

Claude-specific logic should remain as a provider/channel compatibility layer, not the core runtime model.

## Initial Module Targets

Recommended TypeScript modules:

```text
skyth/core/session/agent-session.ts
skyth/core/threads/thread.ts
skyth/core/threads/thread-graph.ts
skyth/core/threads/thread-router.ts
skyth/core/run/orchestrator.ts
skyth/core/run/step-runner.ts
skyth/core/context/context-builder.ts
skyth/core/events.ts
skyth/core/providers/provider.ts
skyth/core/tools/tool-context.ts
skyth/core/tools/tool-executor.ts
skyth/core/policies/tool-loop-policy.ts
skyth/core/policies/permission-policy.ts
skyth/core/policies/concurrency-policy.ts
skyth/core/policies/compaction-policy.ts
skyth/core/delegation/delegation-controller.ts
skyth/core/capabilities/registry.ts
skyth/core/capabilities/manifest-schema.ts
skyth/core/capabilities/ax-schema.ts
skyth/core/capabilities/lifecycle.ts
skyth/core/memory/provider.ts
skyth/core/memory/quasar-memory-provider.ts
skyth/gateway/
skyth/quasar/client.ts
```

## Reference Mapping

- `refs/harnesses/claude-gateway`: gateway/MCP/channel/capability baseline.
- `legacy(ts)`: UX, context builder, thread/session graph behavior, delegation model, memory ergonomics.
- `refs/harnesses/opencode`: clean inner model/tool loop.
- `refs/harnesses/hermes-agent`: guardrails, skill creation, curator, memory provider plugins.
- `refs/harnesses/openclaw`: outer orchestration, lifecycle hooks, install/import philosophy, queued runs.
- `~/dev/experiments/drag`: staged retrieval and domain-aware decay guidance.

## Non-Goals

- Do not rewrite the runtime in Python.
- Do not make the gateway the agent brain.
- Do not let providers execute tools.
- Do not make external memory providers the only source of truth by default.
- Do not auto-promote generated tools/MCPs to permanent capabilities.
- Do not expose core source editing as a normal self-improvement path.
- Do not inject every installed skill into the prompt.
