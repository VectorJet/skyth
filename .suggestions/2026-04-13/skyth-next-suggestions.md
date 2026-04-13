# Skyth Next: Suggestions

**Date:** 2026-04-13
**Companion to:** `.questions/2026-04-13/skyth-next-questions.md`
**Basis:** All harness explorations in `.findings/`, Skyth-ts legacy codebase knowledge, AGENTS.md policy, and the comparative analysis.

---

## 1. Core Architecture Identity

### 1.1 Kernel vs. Platform
**Suggestion: Stratified core with a strict "core contract" boundary.**

Neither Pi's radical minimalism nor OpenCode's batteries-included approach is the right answer alone. Skyth Next should define three tiers:

- **Tier 0 (Kernel):** Agent loop, context builder, provider abstraction, tool registry, session persistence, compaction engine. These are non-negotiable. They ship in every deployment and cannot be disabled.
- **Tier 1 (Core Extensions):** Delegation/subagent framework, channel manager, permission engine, memory pipeline, skill system. These ship with the harness but can be individually disabled via config. They register through the same manifest/registry system as external extensions.
- **Tier 2 (Extensions):** Specific channel adapters, specialist agents, advanced memory pipelines (Quasar), UI components, hooks, MCP servers. These are discovered and loaded via registry. They can be first-party or third-party.

The key insight from the findings: Pi proves a clean kernel is possible, but Skyth-ts already had delegation and channels in core and they worked well. The compromise is to ship Tier 1 as "core extensions" -- they use the extension API internally, but they are bundled and maintained as part of the project. This avoids Pi's "missing batteries" problem without creating OpenCode's monolithic coupling.

### 1.2 Runtime Shape
**Suggestion: Single package, strict internal module boundaries, Skyth-ts style.**

Multi-package stacks (Pi's `ai` -> `agent` -> `coding-agent`) are elegant but add build/publish/versioning overhead. Skyth-ts proved that a single package with disciplined file sizes (under 350 LOC) and clear module directories achieves the same intellectual separation without the operational cost.

The structure should be:

```
skyth/
  core/           -- Tier 0: loop, context, providers, tools, sessions, compaction
  delegation/     -- Tier 1: subagent framework
  channels/       -- Tier 1: channel manager + base adapter
  memory/         -- Tier 1: memory pipeline
  permissions/    -- Tier 1: permission engine
  skills/         -- Tier 1: skill system
  extensions/     -- Extension loader, registry, manifest validation
  cli/            -- CLI entry and TUI
  gateway/        -- Gateway server
```

Each directory has its own `index.ts` barrel export. Cross-directory imports go through barrel exports only. This is enforceable by lint rules.

One center of gravity: the core agent loop. The gateway and CLI are surfaces around it (Claude Code model), but the gateway is a first-class surface, not an afterthought.

### 1.3 Gateway-First vs. Agent-First
**Suggestion: Agent-first with gateway as a managed wrapper, dual-mode by design.**

The agent loop should be fully functional without a gateway. A user running `skyth` in a terminal talks directly to the agent loop. This keeps the core clean and testable.

The gateway wraps the agent loop and adds:
- Channel routing and delivery
- Session persistence across channels
- Auth and identity
- Cross-device continuity
- Service lifecycle (daemon mode)

This is closer to the Claude Code model than the OpenClaw model. The agent is not a "managed workload inside a gateway." The gateway is a "coordination layer around a standalone agent."

The dual-mode contract: `AgentSession` is the core API. CLI mode creates one directly. Gateway mode creates one per incoming session request. Both paths use the exact same loop, context builder, and tool registry. The gateway adds session routing, channel delivery, and cross-channel state -- nothing more.

### 1.4 The "God File" Problem
**Suggestion: Enforce via three structural rules.**

1. **400 LOC hard limit** (already in AGENTS.md). The `loc_check.sh` script catches violations. Any file hitting 350+ LOC must be split before the next feature lands.
2. **Single-responsibility barrel exports.** Each module directory has an `index.ts` that exports only the public API. If a module's public API surface grows beyond ~15 exports, it needs to be split into sub-modules.
3. **Responsibility caps per module.** No module may own more than one of: (a) orchestration/control flow, (b) state persistence, (c) prompt assembly, (d) transport/protocol. If a module starts touching two of these, it must be split.

The "just add it to the main loop" pressure is real. The defense is that the loop module (`core/loop.ts`) only handles the model/tool iteration cycle. Everything it needs (compaction, permission checking, tool execution, context building) is injected as dependencies, not imported directly. This makes it physically impossible for the loop to absorb unrelated responsibilities.

---

## 2. Agent Loop and Turn Execution

### 2.1 Loop Sophistication
**Suggestion: Four-layer compaction stack, not six.**

Claude Code's six layers exist because it serves millions of users and needs extreme resilience. Skyth Next should start with four layers that cover the critical paths:

1. **Tool-result budgeting** -- Truncate oversized tool results before they enter history. Cheap, always-on.
2. **Microcompact** -- Trim old tool results to summaries when context reaches 70% capacity. Fast, algorithmic, no LLM call.
3. **Full compaction** -- LLM-based summarization of older history when context reaches 85% capacity. Uses a cheaper model.
4. **Reactive compact** -- Emergency compaction on prompt-too-long errors. Aggressive summarization + retry.

Skip for now: history snip (subsumed by microcompact), context collapse (extreme edge case), max-output-token escalation (provider-specific optimization that can be added later).

Fallback model retry should exist but is a provider-layer concern, not a compaction-layer concern.

### 2.2 Hybrid Programmatic + LLM Steps
**Suggestion: Yes, adopt this. Use AsyncGenerator protocol.**

Codebuff's hybrid model is one of the most distinctive ideas in the set. It lets agent authors collapse multi-step deterministic workflows without burning tokens. The TypeScript equivalent:

```typescript
type StepCommand =
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "step" }        // proceed to next LLM step
  | { type: "end"; output?: string }

type AgentGenerator = AsyncGenerator<StepCommand, void, ToolResult>
```

The loop checks for a generator before each LLM step. If the generator yields a tool call, the loop executes it and sends the result back into the generator. If it yields `step`, the loop runs an LLM step. If it yields `end`, the turn is done.

Compaction interaction: the generator's accumulated state is internal to the generator function. If compaction runs, the generator does not need to know -- it only sees tool results. If the turn is interrupted, the generator is abandoned and the loop resumes from the last checkpoint.

### 2.3 Doom-Loop and Runaway Detection
**Suggestion: Signature-based detection with configurable response.**

Track the last N tool-call signatures (tool name + argument hash). If the same signature appears 3 times consecutively, trigger doom-loop handling.

Default response: pause and ask the user. The user can choose to continue, switch model, or abort. This is the OpenCode model and it is the right default because automatic recovery (switching models, aborting) can lose work.

Semantic detection is too expensive for a real-time loop. Behavioral detection (N consecutive failures) is a separate concern -- that is error handling, not doom-loop detection.

### 2.4 Parallel Tool Execution
**Suggestion: Opt-in per tool with batch-level safety analysis.**

Each tool declares `concurrencySafe: boolean` in its definition. The loop collects all tool calls from a single model response. If all are marked concurrent-safe and their arguments do not reference overlapping paths, execute in parallel. Otherwise, execute sequentially.

This is a hybrid of Nanobot's flags and Hermes's batch analysis. The flag is the fast path; the path-overlap check is the safety net.

Start conservative: default `concurrencySafe` to `false`. Tools must explicitly opt in.

### 2.5 Tool Disabling on Final Step
**Suggestion: Preserve this behavior from Skyth-ts, but make the "final step" concept configurable.**

Disabling tools on the final step forces the model to produce a text response instead of an infinite tool-calling loop. This is a simple and effective closure mechanism.

However, "final step" should not be a hard-coded iteration count. It should trigger when:
- The iteration count reaches the configured maximum minus one, OR
- The model's previous response was text-only (no tool calls) and the user has not sent a new message

Compaction does not re-enable tools because compaction does not change the iteration count. If compaction freed space, the model can use that space for its text response.

---

## 3. Compaction and Context Management

### 3.1 Compaction Architecture
**Suggestion: Hybrid -- algorithmic lightweight layers + agent-based full compaction.**

Layers 1-2 (tool-result budgeting, microcompact) are algorithmic. No LLM call needed. They run as middleware in the context builder.

Layer 3 (full compaction) uses a dedicated compaction agent -- a hidden internal agent with a cheaper/faster model. This is the Codebuff/OpenCode approach and it produces better summaries than algorithmic truncation. The compaction agent sees the history it needs to summarize but has no tools -- it only produces text.

Layer 4 (reactive compact) is the same compaction agent but with more aggressive instructions ("summarize everything older than the last 3 turns").

Pi's session-tree awareness should be adopted: compaction entries are stored as nodes in the session tree, so branching and compaction interact correctly.

### 3.2 Prompt-Cache Stability
**Suggestion: Adopt Claude Code's discipline.**

Three rules:
1. **Stable section ordering.** System prompt sections are assembled in a fixed order: identity -> behavior rules -> workspace bootstraps -> memory -> skills -> environment metadata. This order never changes between turns.
2. **Stable tool ordering.** Tools are sorted deterministically (alphabetical by name within each scope tier). Tool additions/removals invalidate cache, but reorderings never happen.
3. **No random paths.** Any section that includes file paths uses normalized, deterministic paths. No temp file paths, no randomized identifiers in the prompt.

This should be measured. Add a diagnostic that logs the hash of the first N tokens of the prompt and tracks cache hit/miss rates.

### 3.3 Compaction Agent vs. Algorithmic Compaction
**Suggestion: Both, layered (see 3.1).**

The compaction agent should use the cheapest capable model available (e.g., a small model configured in `compactionModel` config). If no cheap model is configured, fall back to the primary model.

Token estimation: use `tiktoken` (available as a Bun-compatible npm package) or a fast approximation (4 chars per token for English). Exact counts are not needed for compaction thresholds -- the reactive layer catches overflow.

---

## 4. Memory Architecture

### 4.1 Session vs. Long-Term Memory
**Suggestion: Cross-session long-term memory as a Tier 1 core extension.**

Session-local memory is table stakes. Cross-session memory is what makes Skyth Next a persistent assistant, not just a coding tool. This aligns with Skyth-ts's existing investment in daily summaries and session primers.

The memory model:
- **Session memory:** In-memory message history + JSONL persistence. This is Tier 0 (kernel).
- **Long-term memory:** Curated durable files (MEMORY.md, USER.md) + searchable session archive. This is Tier 1 (core extension, can be disabled).

Long-term memory interacts with compaction: when a session is compacted, the compaction summary is also appended to the session archive. When a session ends, a memory flush step (Hermes model) saves durable facts.

### 4.2 Memory Pipeline
**Suggestion: Adopt Nanobot's Dream model with Hermes's pre-reset flush.**

Two processes:
1. **Pre-reset flush (synchronous).** Before a session context is cleared or a session ends, spawn a short-lived tool-limited agent that reads recent history and saves important facts to MEMORY.md. This is the Hermes model and it prevents information loss at the most critical moment.
2. **Background curation (asynchronous).** Periodically (configurable -- daily by default), a background process reads the session archive and edits MEMORY.md, USER.md, and SOUL.md. This is the Nanobot Dream model. It consolidates facts, removes outdated information, and keeps durable files useful.

Quasar's role: if Quasar is the Rust persistence/search layer, it should own the session archive storage and FTS index. The TypeScript harness writes events; Quasar indexes and serves queries.

### 4.3 Session Search
**Suggestion: Yes, expose session search as a native tool.**

The agent should be able to search past sessions. This is a genuine capability gap in most coding harnesses and a clear advantage from Hermes.

Storage backend: SQLite with FTS5. Bun has excellent SQLite support via `bun:sqlite`. The session archive is already JSONL; a background indexer can maintain an FTS5 table alongside it.

Searchable scope: all sessions for the current agent scope (if agent scoping is enabled) or all sessions globally. A configurable retention policy controls how far back search goes.

### 4.4 Memory File Curation
**Suggestion: Background process, configurable schedule, agent-based.**

The curation agent is a hidden internal agent (like the compaction agent). It runs on a timer (default: daily, configurable). It reads the session archive since the last curation run and edits durable memory files.

The curation agent has restricted tools: read memory files, write memory files, read session archive. No shell, no network, no filesystem access beyond memory.

---

## 5. Multi-Agent and Delegation

### 5.1 Delegation Model
**Suggestion: Preserve Skyth-ts's DelegationCallStack, add lifecycle tracking from OpenClaw.**

The core safety model from Skyth-ts is non-negotiable:
- Bounded delegation depth (configurable, default 3)
- Circular-call prevention
- Subagent-to-subagent delegation blocking

Add from OpenClaw:
- Lifecycle tracking: each subagent run is registered, tracked, and can be inspected or cancelled
- Session binding: subagent results are bound to the parent session as structured parts

Do not adopt OpenClaw's full agent scoping model initially. That level of formality (separate workspace, auth profiles, session store per agent) is needed for a multi-tenant platform but is over-engineering for a coding harness.

### 5.2 Subagent Capabilities
**Suggestion: Nanobot model with adjustments.**

Subagents get:
- All read-only tools
- Write tools within the workspace
- No `spawn` tool (no further delegation -- enforced by call stack)
- No `message` tool (no channel output -- subagents report back to parent)
- Iteration cap: configurable, default 15

Subagents share the parent's session context (they can see what has happened) but their turns are recorded as subagent parts within the parent session. They do not get their own independent sessions.

Subagents can access long-term memory (read-only) but cannot write to it. Only the primary agent or the memory flush agent can write durable memory.

### 5.3 Specialist vs. General Agents
**Suggestion: Ship a minimal set of built-in specialists, make custom specialists easy to define.**

Built-in specialists:
- **Worker** -- General-purpose subagent for parallel subtasks. Full tool access minus spawn/message.
- **Explorer** -- Read-only subagent for codebase research. Only search/read/glob tools.
- **Compaction** -- Hidden internal agent for context summarization. No tools.

Do not ship: editor, thinker, reviewer, context-pruner (Codebuff model). These are opinionated workflow choices that belong in extensions or user-defined agent templates.

Custom specialist definition should be simple: a markdown file or JSON manifest that specifies name, system prompt, tool allowlist, model override, and iteration cap.

### 5.4 Agent Scoping
**Suggestion: Start with minimal agent scope, design for future expansion.**

Minimum viable agent scope:
- Agent ID
- System prompt override
- Model override
- Tool policy (allow/deny list)
- Skill filters

This is enough to create meaningfully different agents without the infrastructure overhead of separate workspaces and session stores.

Design the data model so that workspace isolation, auth profiles, and per-agent session stores can be added later without breaking changes. But do not build them until there is a concrete use case.

---

## 6. Provider and Model Layer

### 6.1 Provider Abstraction
**Suggestion: Pi's internal message model + Nanobot's normalized response.**

Internal messages use a richer type than any provider's wire format:

```typescript
type InternalMessage = {
  role: "user" | "assistant" | "system" | "tool_result"
  parts: InternalPart[]  // text, reasoning, tool_use, tool_result, image, metadata
  metadata?: { turnId, timestamp, agentId, compacted }
}
```

Provider responses are normalized to:

```typescript
type ProviderResponse = {
  text?: string
  reasoning?: string
  toolCalls?: ToolCall[]
  usage: TokenUsage
}
```

Providers are adapters at the boundary. The core loop never sees provider-specific types.

Provider-specific features (Anthropic prompt caching, OpenAI structured output) are exposed through optional provider capabilities that the loop can query: `provider.supports("promptCaching")`. The loop uses these to optimize but does not require them.

### 6.2 Provider-Adaptive Prompts
**Suggestion: Yes, but through a template adapter layer, not separate template files.**

A prompt adapter transforms the assembled system prompt for a specific provider family. For example:
- Anthropic adapter: reorder sections for cache stability, add cache-control markers
- OpenAI adapter: merge reasoning instructions into system prompt
- Gemini adapter: adjust tool-calling instructions for Gemini's style

The adapter receives the fully assembled prompt and returns a provider-adapted version. This keeps the core prompt assembly provider-agnostic while allowing per-provider optimization.

One adapter per provider family, not per model. Adapters are registered in the provider registry.

### 6.3 Provider Failover and Rotation
**Suggestion: Automatic failover with state preservation.**

On provider failure:
1. If tools have not executed yet: retry with fallback provider immediately.
2. If tools have partially executed: preserve tool results, switch provider, continue the turn with existing context. The tool results are already in the message history.
3. If all retries fail: surface the error to the user with the option to retry with a different provider.

Failover should be automatic by default but configurable. Users who want manual control can set `failover: "manual"` in config.

Auth-profile rotation (OpenClaw model) is not needed initially. One set of provider credentials per provider is sufficient.

### 6.4 Model Resolution
**Suggestion: Static metadata bundled with the package, with optional dynamic refresh.**

Bundle a snapshot of model metadata (context limits, capabilities, pricing) with each release. This ensures offline functionality and deterministic behavior.

Optionally fetch updated metadata from `models.dev` on startup if network is available. Cache the result under `~/.skyth/cache/models.json`. If the fetch fails, fall back to bundled metadata silently.

This avoids the Skyth-ts problem of depending on an external service for basic functionality.

---

## 7. Tool System

### 7.1 Tool Contract
**Suggestion: Middle ground -- richer than Nanobot, simpler than Claude Code.**

```typescript
interface ToolDefinition {
  name: string
  description: string
  parameters: JSONSchema
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
  safety: "read_only" | "write" | "destructive"
  concurrencySafe: boolean
  scope: "builtin" | "agent" | "workspace" | "extension" | "mcp"
}
```

Tools carry safety classification and concurrency metadata. They do not carry their own prompt rendering or UI state rendering -- that is the harness's responsibility.

The `ToolContext` provides session ID, abort signal, permission asker, and workspace path. It does not expose the full message history or the provider.

### 7.2 Tool Discovery and Registration
**Suggestion: Layered discovery with deterministic precedence.**

Discovery order (highest precedence first):
1. Extension-registered tools (from loaded extensions/plugins)
2. Agent-local tools (from agent's tool directory)
3. Workspace tools (from workspace `tools/` directory)
4. MCP tools (from configured MCP servers)
5. Built-in tools (shipped with Skyth Next)

Conflicts: higher-precedence tools shadow lower-precedence tools with the same name. A diagnostic warning is emitted when shadowing occurs.

MCP tools are first-class citizens. They appear in the tool registry with `scope: "mcp"` and are indistinguishable from native tools in the model's view.

### 7.3 Tool Safety
**Suggestion: Permission-gated with hide option.**

Default behavior:
- `read_only` tools: always allowed, no confirmation
- `write` tools: allowed by default, confirmable via config
- `destructive` tools: require confirmation by default

Claude Code's "hide from model" behavior should be available as an advanced option (`toolPolicy.hide: ["tool_name"]`), but the default is visibility with execution gating. Hidden tools save tokens but risk confusing the model when it needs a capability it cannot see.

Sandbox execution (bwrap, containers): out of scope for initial release. Design the tool execution interface so that a sandbox wrapper can be injected later without changing tool implementations.

### 7.4 Tool Result Handling
**Suggestion: Inline with budget-based truncation.**

Tool results are stored inline in the message history (direct model). This is simpler and matches what every provider expects.

Budget-based truncation: if a tool result exceeds a configurable token budget (default: 8,000 tokens), it is truncated with a note: `[Result truncated. Original length: N tokens. Use targeted queries for more detail.]`

Very large results (file reads) should be handled by the tool itself: the `read_file` tool should accept line ranges and return focused excerpts rather than entire files.

---

## 8. Channel and Surface Architecture

### 8.1 Channel Model
**Suggestion: Channels as Tier 1 core extensions, registry-discovered.**

The channel manager and base adapter contract are Tier 1 (core extension). Individual channel adapters (Telegram, Discord, etc.) are Tier 2 (extensions).

Initial target channels for first-party adapters:
- CLI (always available, not a "channel" adapter -- it is the default surface)
- Web (WebSocket-based chat interface)
- Telegram (most common personal-agent channel)

Additional channels can be added by third parties via the extension system.

Minimum channel adapter contract:

```typescript
interface ChannelAdapter {
  id: string
  initialize(config: ChannelConfig, bus: MessageBus): Promise<void>
  shutdown(): Promise<void>
  send(chatId: string, message: OutboundMessage): Promise<void>
  capabilities: ChannelCapabilities  // text, images, files, typing, reactions
}
```

### 8.2 Channel Discovery
**Suggestion: Same registry + manifest system as everything else.**

Channels register via manifest just like tools, agents, and providers. The manifest includes:
- `id`, `name`, `version`, `entrypoint`
- `capabilities` (what the channel supports)
- `configSchema` (what config fields the channel needs)

This is consistent with AGENTS.md's mandate for registry-based auto-discovery across all extensible domains.

### 8.3 Cross-Channel Continuity
**Suggestion: Preserve Skyth-ts's `channel:chatId` keying.**

Sessions are keyed by `channel:chatId`. When a user is identified across channels (via explicit linking, not automatic), their sessions are accessible from any channel.

Cross-channel switch detection: when a user resumes a conversation from a different channel, a system note is injected into the context ("User switched from Telegram to CLI"). The agent can adapt its response format accordingly.

Automatic cross-channel continuity should be opt-in, not default. Users must explicitly link their identities across channels.

### 8.4 CLI as a Channel
**Suggestion: CLI is a special first-class surface, not a channel adapter.**

The CLI talks directly to `AgentSession`. It does not go through the message bus or channel routing. This keeps the simplest use case (local terminal) fast and dependency-free.

The CLI has privileges that channels do not: direct filesystem access for attaching files, ability to run in interactive mode with real-time steering, and access to TUI rendering.

If the gateway is running, the CLI can optionally connect to it as a client (like OpenCode's remote attach). But standalone CLI mode works without a gateway.

---

## 9. Session and State Model

### 9.1 Session Persistence
**Suggestion: JSONL files with tree structure (Pi model).**

JSONL is human-readable, append-only, and trivially parseable. Each line is a typed entry:
- `message` (user/assistant/tool messages)
- `compaction` (compaction summary replacing older messages)
- `branch` (branch point marker)
- `metadata` (model changes, label assignments)
- `delegation` (subagent start/finish)

Tree structure allows branching and navigation. The session manager maintains an in-memory tree built from the JSONL file on load.

SQLite is used separately for the session archive (searchable index of past sessions), not for active session state.

Sessions should be forkable (create a new session from a branch point) but not shareable across users initially. Sharing can be added later.

### 9.2 Session Parts Model
**Suggestion: Adopt OpenCode's rich part model, extended.**

Part types:
- `text` -- Assistant text response
- `reasoning` -- Model's reasoning/thinking output
- `tool_use` -- Tool call with arguments
- `tool_result` -- Tool execution result
- `step_start` / `step_finish` -- Turn boundaries
- `compaction` -- Compaction summary
- `delegation_start` / `delegation_finish` -- Subagent lifecycle
- `channel_switch` -- Cross-channel transition
- `memory_operation` -- Memory read/write events

Parts are streamed incrementally. The session persistence layer appends parts as they arrive. Clients render parts in real-time.

### 9.3 Session Graph
**Suggestion: Preserve Skyth-ts's session graph, simplify switch-merge.**

Keep `channel:chatId` keying and cross-channel session linking. Simplify switch-merge: when a conversation moves channels, create a new session entry linked to the previous one via `parentSessionId`. Do not try to merge sessions automatically -- that is error-prone.

Multi-agent interaction: subagent turns are recorded as delegation parts within the parent session. They do not create separate sessions. This keeps the session graph clean and the delegation relationship explicit.

---

## 10. Prompt Engineering

### 10.1 System Prompt Assembly
**Suggestion: Preserve Skyth-ts's ContextBuilder layering with cache-optimized ordering.**

Assembly order (optimized for prompt-cache stability):
1. Identity prompt (static, highly cacheable)
2. Behavior rules and execution policy (static)
3. Tool descriptions (stable across turns, changes only when tools are added/removed)
4. Workspace bootstrap files (AGENTS.md, SOUL.md, etc. -- stable within a session)
5. Long-term memory (MEMORY.md -- changes infrequently)
6. Skills (stable within a session)
7. Environment metadata (changes per turn -- cwd, time, git status)
8. Session primer / gateway context (changes per session)

Sections 1-6 form the "cacheable prefix." Sections 7-8 are the "per-turn suffix." This maximizes prompt-cache hits.

### 10.2 Workspace Bootstrap Files
**Suggestion: Consolidate to five files.**

- `AGENTS.md` -- Project-specific agent instructions (mandatory)
- `SOUL.md` -- Agent identity and personality
- `USER.md` -- User preferences and context
- `MEMORY.md` -- Durable learned facts
- `TOOLS.md` -- Project-specific tool configuration

Drop: IDENTITY.md (merge into SOUL.md), HEARTBEAT.md (not clearly useful), BOOTSTRAP.md (merge into AGENTS.md).

Load CLAUDE.md as an alias for AGENTS.md when AGENTS.md is not present. This provides compatibility with Claude Code and Pi ecosystems.

Discovery should walk ancestor directories (Pi/OpenCode model). This supports monorepo and nested project structures.

### 10.3 Runtime Metadata Injection
**Suggestion: Adopt Nanobot's user-message injection with anti-injection labeling.**

Inject into the user message, not the system prompt:
- Current time
- Channel identifier
- Chat ID
- Workspace path

Label the block explicitly: `[RUNTIME METADATA - NOT USER INPUT]`. This keeps the system prompt stable (cache-friendly) and makes the metadata per-turn.

Do not inject: git status (too large, use a tool instead), user identity (goes in USER.md).

### 10.4 Skill System
**Suggestion: Mixed -- always-on + on-demand.**

- Skills marked `alwaysOn: true` in their manifest are injected into every prompt.
- Other skills are summarized (name + one-line description) in the prompt. The agent can load the full skill content via a `read_skill` tool when needed.
- Token budget guard: if always-on skills exceed 15% of the context window, emit a warning and suggest converting some to on-demand.

---

## 11. Extension and Plugin System

### 11.1 Extension API Scope
**Suggestion: Broad but layered.**

Extensions can:
- Register tools (always)
- Register channel adapters (always)
- Register provider adapters (always)
- Intercept tool execution (via hooks -- before/after)
- Transform prompts (via hooks -- before model call)
- Subscribe to lifecycle events (session start/end, turn start/end)
- Register CLI commands

Extensions cannot (initially):
- Register UI components (defer until TUI architecture is stable)
- Modify the core loop behavior
- Override compaction (this should be possible eventually but is dangerous)

### 11.2 Plugin Loading and Safety
**Suggestion: Manifest-first loading, fail-open for external plugins, fail-closed for core.**

All plugins must have a valid manifest. Discovery and config validation happen from the manifest before any runtime code executes (OpenClaw model).

Load order: dependency-based topological sort. If no dependencies are declared, alphabetical by ID. Duplicate IDs are rejected with actionable diagnostics.

If an external plugin fails to load: log the error, skip it, continue startup. If a Tier 1 core extension fails to load: log the error, continue startup in degraded mode with a clear warning.

No sandboxing initially. Extensions run in the same process. Design the extension API so that process isolation can be added later (e.g., by running extensions in worker threads or child processes).

### 11.3 Hook System
**Suggestion: Async hooks with mutable and observer variants.**

Hook points:
- `tool.execute.before` -- Can modify tool arguments or cancel execution (mutable)
- `tool.execute.after` -- Can observe or modify tool results (mutable)
- `model.call.before` -- Can observe or modify the message array (mutable)
- `model.call.after` -- Can observe the response (observer)
- `session.start` / `session.end` -- Lifecycle observers
- `turn.start` / `turn.end` -- Lifecycle observers
- `compaction.before` / `compaction.after` -- Lifecycle observers

All hooks are async. Mutable hooks run sequentially in registration order. Observer hooks can run in parallel.

---

## 12. Security

### 12.1 Secret Management
**Suggestion: Environment variables + encrypted config file.**

Primary path: environment variables. This is the standard for server deployments and CI.

Secondary path: encrypted config file at `~/.skyth/secrets.enc`. Encrypted with a master key derived from a user-provided passphrase. The passphrase is prompted at startup if the encrypted file exists and no environment variables are set.

Secrets never appear in: logs, prompts, tool results, session files, or error messages. The secret manager provides opaque handles that resolve to values only at the point of use (provider API call).

### 12.2 Permission Model
**Suggestion: Central permission engine, per-tool + per-path.**

Permissions are evaluated centrally, not scattered across tools:

```typescript
type PermissionResult = "allow" | "deny" | "ask"
```

Rules are configurable:
- Per-tool: `permissions.tools.shell = "ask"`
- Per-path: `permissions.paths["/etc/**"] = "deny"`
- Per-safety-class: `permissions.destructive = "ask"`

Subagent permissions: subagents inherit the parent's permission decisions for the current session. If the parent already approved a destructive tool, the subagent does not re-ask. If the subagent needs a tool the parent has not yet approved, it escalates to the parent's permission context.

### 12.3 Prompt Injection Defense
**Suggestion: Defense in depth -- labeling + static analysis + runtime guards.**

1. **Labeling:** All untrusted content (tool results, user files, external data) is wrapped in explicit markers: `[BEGIN UNTRUSTED CONTENT] ... [END UNTRUSTED CONTENT]`.
2. **Static analysis:** A test suite scans all prompt templates for injection vectors (Skyth-ts model). Run as part of CI.
3. **Runtime guards:** The context builder strips or escapes known injection patterns from tool results before inserting them into the message history.

### 12.4 Network and Sandbox Security
**Suggestion: URL blocklist + command denylist, no sandbox initially.**

Shell tool: maintain a denylist of destructive commands (`rm -rf /`, `mkfs`, `dd`, etc.) and a blocklist of internal/private URLs (RFC 1918 ranges, localhost, link-local).

Full sandbox (bwrap, containers): out of scope for initial release. The tool execution interface should accept an optional `sandbox` wrapper so this can be added later.

---

## 13. UX and Surfaces

### 13.1 Primary Surface
**Suggestion: CLI-first, with headless/SDK mode from day one.**

Priority order:
1. Interactive CLI (terminal REPL)
2. Headless/SDK mode (`--print`, piped input)
3. Gateway service mode
4. Web interface

Headless mode is critical for CI/CD integration and embedding in other tools. It should work from day one, not as an afterthought.

### 13.2 Terminal UI
**Suggestion: Start with a clean readline-based CLI, add rich TUI later.**

A readline-based CLI with markdown rendering and syntax highlighting is sufficient for initial release. It is fast to build, easy to test, and does not introduce framework dependencies.

Rich TUI (nested agent blocks, progress panels, interactive permission dialogs) can be added in a later phase. When it is added, use a framework compatible with Bun (assess options at that time).

### 13.3 Protocol Separation
**Suggestion: Yes, adopt JSON-lines protocol from day one.**

Define a stable JSON-lines event protocol between the runtime and any client (CLI, TUI, web, external). Events include:
- `text_delta`, `reasoning_delta`
- `tool_call_start`, `tool_result`
- `turn_start`, `turn_end`
- `compaction`
- `error`
- `permission_request`, `permission_response`

This protocol is the contract. The CLI renders events from this protocol. The gateway streams events over this protocol. Future TUI and web clients consume the same protocol.

Document this protocol as a stable contract. Version it.

### 13.4 Onboarding
**Suggestion: Minimal onboarding -- provider key + model selection.**

First-run experience:
1. Prompt for provider API key
2. Auto-detect available models
3. Select default model
4. Write config to `~/.skyth/config.toml`

Channel configuration and advanced setup can be deferred to docs or a separate `skyth setup` command. Do not block basic usage on complex configuration.

---

## 14. Testing and Quality

### 14.1 Test Strategy
**Suggestion: Three test tiers.**

1. **Unit tests:** Core modules (context builder, compaction, tool registry, session manager, permission engine). Fast, no I/O.
2. **Integration tests:** Full turn loop with mock providers. User message -> context build -> mock model response -> tool execution -> response. Verifies the loop end-to-end without real LLM calls.
3. **Security tests:** Static analysis for secret exposure, prompt injection vectors, path traversal. Run in CI.

Target: every Tier 0 module has unit tests. Every critical path has at least one integration test. Security tests are mandatory and blocking.

### 14.2 Agent Loop Testing
**Suggestion: Mock providers with recorded responses.**

Create a `MockProvider` that replays recorded response sequences. Each test case is a sequence of: `[model response 1, expected tool calls, tool results, model response 2, ...]`.

This allows deterministic testing of: multi-turn tool loops, compaction triggers, doom-loop detection, fallback behavior, and delegation.

The mock provider is also useful for demos and development without burning API credits.

---

## 15. Build, Deploy, and Operate

### 15.1 Distribution
**Suggestion: Bun binary + npm package.**

Primary: `bun build --compile` for standalone binary distribution. Support Linux (x64, arm64) and macOS (arm64).

Secondary: npm package for embedding via `bunx skyth` or programmatic import.

Windows: defer to WSL initially. Native Windows support is a future consideration.

### 15.2 Service Mode
**Suggestion: Built-in serve mode, external process manager.**

`skyth serve` starts the gateway as a long-running process. It does not manage its own daemonization -- that is the job of systemd, launchd, or pm2.

Ship example systemd and launchd service files in the repo. Do not build service management into the CLI (Hermes does this and it adds significant complexity).

The service is the gateway. `skyth serve` and `skyth gateway` are the same thing.

### 15.3 Configuration
**Suggestion: TOML config, three-level merge, schema-validated.**

Format: TOML (readable, well-supported in the Bun ecosystem).

Merge precedence (highest first):
1. Environment variables (`SKYTH_*`)
2. Workspace-local `.skyth/config.toml`
3. User-global `~/.skyth/config.toml`

Schema validation at startup using a TypeScript schema definition (not Pydantic -- this is a TS project). Invalid config produces actionable error messages with file path, field name, and expected type.

---

## 16. Migration and Compatibility

### 16.1 Skyth-ts Compatibility
**Suggestion: Port architectural patterns, not code.**

Directly portable concepts:
- `ContextBuilder` prompt assembly pattern (rewrite, do not copy)
- `DelegationCallStack` safety model (rewrite with same semantics)
- Manifest registry validation logic (rewrite with same contract)
- Session graph keying model

Do not try to read Skyth-ts session files or agent manifests. The formats should evolve. Provide a migration guide for manifest format changes.

### 16.2 CLAUDE.md and AGENTS.md Compatibility
**Suggestion: Load CLAUDE.md as fallback for AGENTS.md.**

If AGENTS.md exists, use it. If not, look for CLAUDE.md. If both exist, use AGENTS.md.

AGENTS.md format: free-form markdown. Do not impose a schema -- projects should be able to write whatever instructions they want.

### 16.3 MCP Compatibility
**Suggestion: MCP client from day one, MCP server as a future extension.**

Skyth Next should consume MCP tools natively. MCP tools appear in the tool registry like any other tool.

Exposing Skyth Next as an MCP server is a separate concern. It can be implemented as a Tier 2 extension later. The priority is consuming MCP, not serving it.

---

## 17. Novel Synthesis Suggestions

### 17.1 Contradictory Best Practices
**Resolution: The tiered core model resolves the Pi vs. OpenCode contradiction.**

Tier 0 is Pi-minimal. Tier 1 is OpenCode-practical. Tier 2 is Pi-extensible. This is not a compromise -- it is a deliberate architecture that gets the benefits of both.

The Claude Code vs. Codebuff bet: Skyth Next should have one primary loop (Claude Code model) but support hybrid programmatic + LLM steps within that loop (Codebuff model). The loop is singular and powerful, but agent templates can inject deterministic steps.

Small files despite feature richness: the tiered model with strict module boundaries and the 400 LOC limit naturally distributes code across many focused files. Features from Hermes or OpenCode that required god files in their original harnesses can be implemented in Skyth Next as multiple cooperating modules.

### 17.2 Feature Prioritization
**Suggested priority order:**

**Phase 1 -- Core Loop (MVP):**
1. Agent loop with tool execution
2. Provider abstraction (Anthropic + OpenAI initially)
3. Context builder with prompt assembly
4. Four-layer compaction stack
5. Session persistence (JSONL)
6. Tool registry with built-in tools (read, write, edit, shell, glob, grep, web)
7. Interactive CLI
8. Headless/SDK mode
9. Permission engine
10. Config system with schema validation

**Phase 2 -- Intelligence:**
11. Delegation framework with safety controls
12. Doom-loop detection
13. Hybrid programmatic + LLM steps
14. Skill system
15. Manifest-validated extension loading
16. Long-term memory (MEMORY.md + session archive)

**Phase 3 -- Platform:**
17. Gateway server
18. Channel manager + web channel
19. Cross-channel session continuity
20. Session search (FTS5)
21. Memory flush and background curation
22. Telegram channel adapter

**Phase 4 -- Polish:**
23. Rich TUI
24. MCP client integration
25. Provider failover
26. Prompt-cache optimization
27. Service mode + systemd/launchd examples
28. Parallel tool execution

### 17.3 Competitive Differentiation
**Suggestion: The differentiation is the synthesis quality, not a single novel feature.**

No existing harness combines:
- Claude Code's loop resilience
- Codebuff's hybrid programmatic steps
- Hermes's memory flush and session search
- Nanobot's clean bus architecture
- OpenClaw's agent scoping concepts
- OpenCode's doom-loop detection and rich session parts
- Pi's session tree and extension philosophy
- Skyth-ts's delegation safety and file discipline

...into one system with sub-400 LOC files and a clean tiered architecture.

The novel capability is that Skyth Next is the first harness where all these ideas coexist without god files, without monolithic coupling, and without sacrificing any of them. That is an engineering achievement, not just a feature list.

### 17.4 Performance and Efficiency
**Suggestion: Set concrete budgets.**

- Cold start (no cache): under 500ms
- Hot start (cached config + models): under 200ms
- First token latency: dominated by provider, not harness overhead
- Prompt-cache hit rate: measure and target >80% for multi-turn sessions

Achieve this through: lazy module loading, pre-computed config caching, stable prompt prefix ordering, and avoiding unnecessary I/O on the critical path.

### 17.5 Quasar Integration
**Suggestion: Quasar is the persistence and search engine, accessed via IPC.**

Quasar (Rust) owns:
- Session archive storage (append-only log)
- FTS5 index for session search
- Memory file versioning
- Future: embedding-based semantic search

The TypeScript harness communicates with Quasar via IPC (Unix socket or stdio). The harness writes events; Quasar indexes and serves queries.

This keeps the Rust component focused on what Rust does best (fast, reliable data processing) and the TypeScript harness focused on what TypeScript does best (LLM integration, tool orchestration, UI).

If Quasar is not available (not built, not running), the harness falls back to SQLite-based session archive and search. Quasar is an enhancement, not a dependency.

### 17.6 Architecture Validation
**Suggestion: Spike Phase 1 items 1-8, validate with a real coding task.**

Build the core loop, provider abstraction, context builder, basic compaction, session persistence, tool registry, CLI, and headless mode. Then use it to complete a real coding task (e.g., "add a feature to an existing project").

If the architecture holds for that use case without needing to break module boundaries or create god files, it is validated. If not, refactor before adding more features.

ADRs: yes, create one for each of the 10 critical decisions listed in the questions document. Keep them in `specs/decisions/` as numbered markdown files.
