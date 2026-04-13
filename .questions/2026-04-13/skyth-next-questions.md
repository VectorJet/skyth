# Skyth Next: Open Questions

**Date:** 2026-04-13
**Context:** Skyth Next is a novel agent harness that synthesizes the best ideas from all studied harnesses (Claude Code, Codebuff, Hermes, Nanobot, OpenClaw, OpenCode, OpenHarness, Pi, Skyth-py legacy, Skyth-ts legacy) into a single coherent system. These questions must be answered before or during design/implementation.

**Prerequisites:** Full knowledge of the Skyth-ts legacy codebase, all harness explorations in `.findings/exploration/`, and the comparative analysis in `.findings/harness_comparison.md`.

---

## 1. Core Architecture Identity

### 1.1 Kernel vs. Platform
- Should Skyth Next follow Pi's "minimal kernel + extension ecosystem" philosophy, or OpenCode's "ship workflows in core" philosophy, or something in between?
- Where exactly is the boundary between "core runtime" and "extension territory"? Which capabilities are non-negotiable in core, and which must be extension-only?
- Pi intentionally omits MCP, subagents, plan mode, and permission popups from core. Skyth-ts had delegation and channels in core. What belongs in Skyth Next's core?

### 1.2 Runtime Shape
- Should Skyth Next have a single execution kernel like Claude Code's `QueryEngine`/`query.ts` split, or a layered package stack like Pi's `ai` -> `agent` -> `coding-agent`?
- Is there a third option: a modular kernel where the layers exist but are co-located in a single package with strict internal module boundaries (Skyth-ts style, files under 400 LOC)?
- How many "centers of gravity" should the runtime have? Claude Code has one (the query loop). Hermes has three (agent, gateway, CLI). OpenClaw has two (gateway, embedded agent). What is Skyth Next's answer?

### 1.3 Gateway-First vs. Agent-First
- Skyth-ts was gateway-centric. OpenClaw is gateway-first. Pi and Claude Code are agent-first. Which orientation does Skyth Next take?
- If gateway-first: does the agent become a managed workload inside the gateway (OpenClaw model), or does the gateway exist as one surface around a standalone agent (Claude Code model)?
- If agent-first: how do channels, cross-device sessions, and persistent delivery work without a gateway as the coordination center?
- Is there a clean way to support both modes -- standalone agent for local coding, gateway-hosted agent for omnichannel deployment -- without duplicating the runtime?

### 1.4 The "God File" Problem
- Skyth-ts achieved best-in-set file discipline (core files under 350 LOC). Every other harness eventually produced god files (Hermes 9,858 LOC, Claude Code 4,683 LOC, Pi 4,649 LOC). What structural constraints prevent Skyth Next from following the same path?
- Should there be a hard architectural rule that no single module can own more than N responsibilities, enforced by the module's public API surface?
- How do we prevent the inevitable "just add it to the main loop" pressure that created god files in every other harness?

---

## 2. Agent Loop and Turn Execution

### 2.1 Loop Sophistication
- Claude Code has a six-layer compaction/recovery stack. Is that the target for Skyth Next, or is a simpler layered approach sufficient?
- Which of these recovery mechanisms are essential vs. over-engineering for Skyth Next's use cases:
  - Tool-result budgeting?
  - History snip?
  - Microcompact / cached microcompact?
  - Context collapse?
  - Autocompact?
  - Reactive compact on overflow?
  - Max-output-token escalation and recovery?
  - Prompt-too-long withholding and recovery?
  - Fallback model retry?

### 2.2 Hybrid Programmatic + LLM Steps
- Codebuff's `handleSteps()` generator model allows agents to yield tool calls deterministically without LLM calls. Should Skyth Next adopt this?
- If yes: what is the TypeScript equivalent of Codebuff's generator protocol? AsyncGenerator yielding typed step commands?
- How does the hybrid model interact with compaction? If a programmatic generator has accumulated state, what happens when the context is compacted?

### 2.3 Doom-Loop and Runaway Detection
- OpenCode detects repeated identical tool-call signatures. Skyth-ts tracked repeated tool-call signatures. What is the right detection granularity?
- Should doom-loop detection be signature-based (exact match), semantic (similar intent), or behavioral (N consecutive failures)?
- What should happen when a doom loop is detected: pause and ask user, switch model, abort turn, or escalate to a different agent?

### 2.4 Parallel Tool Execution
- Hermes has path-scoped parallel tool analysis. Nanobot has `concurrency_safe` flags on tools. Most harnesses execute tools sequentially. What is Skyth Next's approach?
- How does parallel tool execution interact with the session state model? If two tools mutate overlapping state, what is the conflict resolution?
- Should parallel execution be opt-in per tool (Nanobot style), analyzed per batch (Hermes style), or always sequential with an explicit parallel mode?

### 2.5 Tool Disabling on Final Step
- Skyth-ts disables tools on the final step to force closure. Is this the right behavior, or should the model be allowed to make final tool calls?
- How does "final step" interact with compaction? If compaction creates more room, should tools be re-enabled?

---

## 3. Compaction and Context Management

### 3.1 Compaction Architecture
- Should Skyth Next adopt Claude Code's six-layer stack, OpenCode's multi-stage pipeline, Pi's session-tree-aware compaction, or Codebuff's "compaction as a specialized agent" approach?
- Can these be combined? For example: tool-result budgeting + microcompact as lightweight layers, with a specialized compaction agent for full summarization, and session-tree-aware persistence?
- Who owns compaction: the loop itself, a dedicated service, or an agent?

### 3.2 Prompt-Cache Stability
- Claude Code treats prompt-cache stability as a first-class engineering concern. OpenCode and Codebuff also invest in it. How does Skyth Next ensure stable prompt prefixes?
- What is the caching strategy: section-level cache keys, stable tool ordering, avoiding random-path busting, or something else?
- Should prompt-cache stability influence the prompt assembly order? If the system prompt has cacheable and non-cacheable sections, should cacheable sections always come first?

### 3.3 Compaction Agent vs. Algorithmic Compaction
- Codebuff spawns a `context-pruner` agent. OpenCode uses a hidden `compaction` agent. Claude Code uses algorithmic approaches. What is right for Skyth Next?
- If a compaction agent: what model does it use? Can it be a cheaper/faster model than the primary agent? Does it have its own tool access?
- If algorithmic: how does token estimation work for the Bun/TypeScript stack? What tokenizer is used?

---

## 4. Memory Architecture

### 4.1 Session vs. Long-Term Memory
- Most coding harnesses (Claude Code, OpenCode, Pi) are session-local only. Hermes and Nanobot have cross-session long-term memory. Skyth-ts had daily summaries, MENTAL_IMAGE notes, and session primers. What is Skyth Next's memory model?
- Is cross-session memory a core feature or an optional extension?
- How does long-term memory interact with compaction? If a compacted summary contains important facts, do those facts also flow into the long-term memory store?

### 4.2 Memory Pipeline
- Nanobot has a two-layer system: live sessions + `Dream`-curated durable files (SOUL.md, USER.md, MEMORY.md). Hermes has a pre-reset memory flush agent. Which model should Skyth Next adopt?
- Should there be an explicit "memory flush" step before context resets, where a short-lived agent saves durable facts (Hermes model)?
- How does the Quasar vision from Skyth specs fit in? Is Quasar the memory pipeline, or is it a broader concept?

### 4.3 Session Search
- Hermes exposes FTS5-backed session search as a native tool the agent can use. Should Skyth Next do the same?
- If yes: what is the storage backend? SQLite FTS5, or something else compatible with the Bun/TypeScript stack?
- How much session history should be searchable? All sessions ever? Last N days? Only sessions for the current agent scope?

### 4.4 Memory File Curation
- Nanobot's `Dream` process periodically edits SOUL.md/USER.md/MEMORY.md from consolidated history. Should Skyth Next have a similar background curation process?
- If yes: when does it run? After every session? On a timer? On demand?
- Who curates: a dedicated agent, the main agent, or an algorithmic process?

---

## 5. Multi-Agent and Delegation

### 5.1 Delegation Model
- Skyth-ts has `DelegationCallStack` with depth limits, circular prevention, and subagent-to-subagent blocking. This is described as the safest delegation model in the set. Should Skyth Next preserve this exactly, or evolve it?
- OpenClaw has the most formal multi-agent infrastructure with scoped agents, lifecycle tracking, and session binding. Should Skyth Next adopt OpenClaw-level formality?
- Codebuff has the most product-opinionated specialist model (editor, thinker, reviewer). Should Skyth Next ship specialist agents, or leave that to extensions?

### 5.2 Subagent Capabilities
- Nanobot strips `message` and `spawn` from subagents and caps them at 15 iterations. What should Skyth Next's subagent capability restrictions be?
- Should subagents share the parent's session, or get isolated sessions (OpenCode model)?
- Can subagents access long-term memory, or only session-local context?

### 5.3 Specialist vs. General Agents
- Codebuff ships distinct agents: orchestrator, editor, thinker, reviewer, file-picker, basher, context-pruner. Each has its own tool allowlist and prompt.
- Should Skyth Next ship any built-in specialist agents, or only the framework for creating them?
- If specialists are shipped: what is the minimum viable set? Orchestrator + worker? Or a richer taxonomy?

### 5.4 Agent Scoping
- OpenClaw gives each agent its own workspace, agentDir, session store, auth profiles, skill filters, and tool policy. Should Skyth Next adopt this level of agent scoping?
- What is the minimum viable agent scope: just prompt + model override + tool policy, or the full OpenClaw model?
- How does agent scoping interact with the registry? Does each agent scope have its own tool/skill registry, or do they share a global one with per-agent filters?

---

## 6. Provider and Model Layer

### 6.1 Provider Abstraction
- Nanobot normalizes all provider output to `LLMResponse`/`ToolCallRequest` so the loop is entirely provider-agnostic. Pi separates internal `AgentMessage[]` from provider `Message[]`. Which pattern should Skyth Next follow?
- Should there be a single internal message type (Nanobot style) or a richer internal message model that carries metadata the provider format cannot (Pi style)?
- How does the provider layer handle provider-specific features like Anthropic's prompt caching, OpenAI's structured output, or Gemini's grounding?

### 6.2 Provider-Adaptive Prompts
- OpenCode has distinct system prompt templates per model family (Anthropic, GPT, Gemini, Codex). Should Skyth Next do the same?
- If yes: how are provider-specific prompt sections managed? Separate template files? Conditional blocks in the prompt builder? A prompt adapter layer?
- How does this interact with prompt-cache stability? Different providers may need different prompt structures, but frequent switching could bust the cache.

### 6.3 Provider Failover and Rotation
- OpenClaw has auth-profile rotation and provider failover. Claude Code has fallback model retry. What is Skyth Next's failover strategy?
- Should failover be automatic (try next provider on failure) or user-confirmed?
- How does failover interact with tool state? If a turn partially executed tools and then the provider fails, what happens to the tool results?

### 6.4 Model Resolution
- Skyth-ts used `models.dev` for dynamic provider discovery with local caching. Is this the right approach, or should model metadata be statically bundled?
- How does the system handle models that appear or disappear from the provider? What is the degraded-mode behavior?

---

## 7. Tool System

### 7.1 Tool Contract
- Claude Code's `Tool.ts` is a full UX/runtime object with permission checks, read-only/destructive semantics, prompt rendering, UI state rendering, MCP metadata. Nanobot's tools are simple classes with `name`/`description`/`parameters`/`execute()`. Where on this spectrum should Skyth Next land?
- Should tools carry metadata about safety classification (read-only, destructive, concurrent-safe)?
- Should tools have their own prompt rendering capabilities, or should the harness handle all prompt construction?

### 7.2 Tool Discovery and Registration
- Skyth-ts discovered tools from multiple sources: global, agent-local, workspace. OpenCode adds plugin-registered and directory-scanned tools. MCP tools are merged in both.
- What is the canonical tool discovery order for Skyth Next?
- How are conflicts resolved when multiple sources register the same tool name?
- Should MCP tools be treated as first-class or second-class citizens in the registry?

### 7.3 Tool Safety
- Nanobot has workspace restriction, shell denylist, optional bwrap sandbox, URL block list. OpenCode has a central permission engine. Claude Code has deny rules that hide tools from the model entirely.
- What is Skyth Next's tool safety model?
- Should unsafe tools be hidden from the model entirely (Claude Code), gated behind permissions (OpenCode), or always visible but execution-guarded (Nanobot)?
- Is sandbox execution (bwrap, containers) in scope for Skyth Next, or out of scope?

### 7.4 Tool Result Handling
- Claude Code has tool-result budgeting that truncates large results. Nanobot has tool result truncation and persistence safeguards. What is Skyth Next's approach?
- Should tool results be stored separately from the conversation history (reference model) or inline (direct model)?
- How are very large tool results (e.g., reading a 10,000-line file) handled without blowing the context window?

---

## 8. Channel and Surface Architecture

### 8.1 Channel Model
- Skyth-ts had adapters for Telegram, WhatsApp, Discord, Slack, email, QQ, Feishu, DingTalk. Hermes and OpenClaw have even broader channel support. What channels does Skyth Next target?
- Should channels be core or extension-only?
- What is the minimum channel adapter contract? Nanobot's `BaseChannel` vs. Hermes's `MessageEvent` abstraction vs. OpenClaw's plugin-registered channels?

### 8.2 Channel Discovery
- Nanobot discovers channels via Python entry points. OpenClaw discovers channels via plugin registry. Skyth-ts had a `ChannelManager` with configured adapters. Which pattern for Skyth Next?
- Should channel discovery use the same registry + manifest system as tools, agents, and providers?
- How does a channel declare its capabilities (text, images, voice, files, reactions, typing indicators)?

### 8.3 Cross-Channel Continuity
- Skyth-ts had session keying by `channel:chatId` with cross-channel switch-merge handling. OpenClaw has cross-channel identity linking. What is Skyth Next's cross-channel story?
- When a user moves from Telegram to CLI to web, how does the session follow?
- Should cross-channel continuity be automatic, manual, or configurable per deployment?

### 8.4 CLI as a Channel
- Should the CLI be treated as just another channel adapter, or is it a special first-class surface?
- If CLI is a channel: does it go through the same message bus and session routing as Telegram or Discord?
- If CLI is special: what privileges does it have that other channels do not?

---

## 9. Session and State Model

### 9.1 Session Persistence
- Pi uses JSONL session files with tree structure. OpenCode has durable forkable shareable sessions. Nanobot uses JSONL per `channel:chatId`. Skyth-ts used JSONL session logs. What is Skyth Next's session format?
- Should sessions support branching and tree navigation (Pi model)?
- Should sessions be forkable and shareable (OpenCode model)?
- What is the storage backend: JSONL files, SQLite, or something else?

### 9.2 Session Parts Model
- OpenCode has a rich message part model: text, reasoning, tool, step-start, step-finish, patch, compaction. Should Skyth Next adopt this?
- How do parts interact with streaming? Are parts streamed incrementally, or only materialized at turn end?
- What additional part types might be needed for Skyth Next's use cases (e.g., delegation-start/finish, memory-operation, channel-switch)?

### 9.3 Session Graph
- Skyth-ts had a session graph model with `channel:chatId` keys and switch-merge handling. Should this be preserved?
- How does the session graph interact with multi-agent? Does each agent get its own session branch, or do they share?
- What is the compaction strategy for the session graph? Per-branch compaction, global compaction, or both?

---

## 10. Prompt Engineering

### 10.1 System Prompt Assembly
- Skyth-ts had `ContextBuilder` with identity + behavior factors + workspace bootstraps + memory + skills + gateway context + session primer. Should Skyth Next preserve this exact layering?
- What is the prompt assembly order for cache stability?
- Should there be an explicit prompt budget that allocates token percentages to each section (system prompt, history, tools, current turn)?

### 10.2 Workspace Bootstrap Files
- Skyth-ts loaded AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md, HEARTBEAT.md, BOOTSTRAP.md. Are all of these still needed?
- OpenHarness and Pi load CLAUDE.md for compatibility. Should Skyth Next also load CLAUDE.md?
- Should bootstrap file discovery walk ancestor directories (Pi/OpenCode model) or only check the workspace root?

### 10.3 Runtime Metadata Injection
- Nanobot injects runtime metadata (time, channel, chat ID) into the user message, not the system prompt, with explicit anti-injection labeling. Should Skyth Next adopt this?
- What metadata should be injected: time, channel, chat ID, user identity, workspace path, git status?
- Where should metadata go: system prompt (stable, cacheable), user message (per-turn, anti-injection aware), or a separate metadata message role?

### 10.4 Skill System
- All harnesses have some form of skills (markdown files discovered from workspace or built-in directories). What is Skyth Next's skill model?
- Should skills be always-on (injected into every prompt), on-demand (loaded via tool when referenced), or a mix?
- How does the skill system interact with the token budget? If skills consume too much of the context window, what is the degradation strategy?

---

## 11. Extension and Plugin System

### 11.1 Extension API Scope
- Pi has the broadest coding-agent extension API (tools, commands, keybindings, UI components, overlays, lifecycle events, session manipulation, compaction influence). OpenClaw has the richest plugin capability platform. What is Skyth Next's extension scope?
- Should extensions be able to modify the prompt (OpenCode plugin transforms)?
- Should extensions be able to intercept tool execution (OpenHarness hooks)?
- Should extensions be able to register their own UI components (Pi extensions)?

### 11.2 Plugin Loading and Safety
- OpenClaw has manifest-first loading with diagnostics before runtime code executes. Skyth-ts had manifest validation with required fields, duplicate detection, and deterministic discovery. What is Skyth Next's plugin safety model?
- Should plugins be sandboxed? If yes, how?
- What happens when a plugin fails to load? Fail-open (skip it) or fail-closed (abort startup)?
- How is deterministic load order enforced? Alphabetical? Manifest-declared priority? Dependency-based topological sort?

### 11.3 Hook System
- OpenHarness has command/HTTP/prompt hook types for lifecycle interception. Hermes has pre/post tool call, pre/post LLM call, session lifecycle hooks. What hooks does Skyth Next expose?
- Should hooks be synchronous (blocking) or asynchronous (non-blocking)?
- Can hooks modify state (mutable hooks) or only observe (observer hooks)?

---

## 12. Security

### 12.1 Secret Management
- AGENTS.md mandates: never store secrets in plaintext, hash passwords/keys, encrypt stored credentials. What is the concrete implementation?
- Where do secrets live at runtime: environment variables, encrypted config files under `~/.skyth/`, a secrets runtime (OpenClaw model)?
- How do secrets flow to tools and providers without exposing them in logs, prompts, or tool results?

### 12.2 Permission Model
- OpenCode has a central `Permission.ask()` -> `allow/deny/ask` engine. Claude Code has deny rules that hide tools entirely. OpenHarness has permission modes and path rules. What is Skyth Next's permission model?
- Should permissions be per-tool, per-action, per-path, or all three?
- How do permissions interact with multi-agent? If a subagent needs a destructive tool, does it inherit parent permissions or require its own approval?

### 12.3 Prompt Injection Defense
- Skyth-ts had prompt-injection static analysis tests. Nanobot labels runtime metadata with anti-injection tags. What is Skyth Next's prompt injection defense?
- Should untrusted content (user files, tool results, external data) be explicitly bracketed or labeled?
- Should there be a static analysis step that scans prompts for injection vectors?

### 12.4 Network and Sandbox Security
- Nanobot blocks internal/private URLs and supports bwrap sandboxing. Is this in scope for Skyth Next?
- Should the shell tool have a command denylist, an allowlist, or both?
- How are outbound network requests from tools controlled?

---

## 13. UX and Surfaces

### 13.1 Primary Surface
- Is Skyth Next primarily a CLI/TUI (Claude Code, Pi), a web app (Skyth-py), a gateway service (Skyth-ts, OpenClaw), or all of the above?
- What is the priority order of surfaces for the initial release?
- Should there be a headless/SDK mode from day one (Claude Code's `--print`, Pi's RPC mode)?

### 13.2 Terminal UI
- Should Skyth Next have a rich TUI (Codebuff's React/OpenTUI, Pi's TUI, OpenHarness's React terminal)? Or a simpler readline-based CLI?
- If rich TUI: what framework? React Ink? Custom?
- Should the TUI support rendering nested agent blocks (Codebuff model)?

### 13.3 Protocol Separation
- OpenHarness has a clean JSON-lines event/request protocol between frontend and backend. Pi has JSONL RPC mode. Should Skyth Next adopt protocol separation?
- If yes: what is the protocol? JSON-lines, WebSocket messages, SSE, or something else?
- Should the protocol be documented as a stable contract for third-party clients?

### 13.4 Onboarding
- Skyth-ts had first-class onboarding flows (CLI, web, guided setup). Should Skyth Next invest in onboarding UX from day one?
- What is the minimum viable onboarding: provider key setup + model selection + channel configuration?

---

## 14. Testing and Quality

### 14.1 Test Strategy
- Skyth-ts had 51 test files including security-oriented pentest-style checks. What is Skyth Next's test strategy?
- Should there be dedicated security test suites (prompt injection, secret exposure, path traversal)?
- Should there be integration tests that exercise the full turn loop (user message -> model call -> tool execution -> response)?

### 14.2 Agent Loop Testing
- How do you test the agent loop without making real LLM calls? Mock providers? Recorded responses? Deterministic test agents?
- Should there be a test harness mode that runs the full loop with deterministic tool results?

---

## 15. Build, Deploy, and Operate

### 15.1 Distribution
- Skyth-ts used Bun. The current repo uses Bun. Should Skyth Next also compile to a single binary (`bun build --compile`)?
- Should there be a global install path (`bunx skyth`, npm global)?
- What platforms must be supported: Linux, macOS, Windows?

### 15.2 Service Mode
- Hermes has systemd/launchd service support. OpenClaw runs as a persistent daemon. Should Skyth Next support service/daemon mode?
- If yes: what process manager? systemd? pm2? Bun's built-in serve?
- How does the service mode relate to the gateway? Is the service the gateway?

### 15.3 Configuration
- What is the config file format: YAML, TOML, JSON?
- Where does config live: `~/.skyth/config.{ext}`, workspace-local `.skyth/config.{ext}`, environment variables, or all three with merge precedence?
- Should config be schema-validated at startup (AGENTS.md mandates this)?

---

## 16. Migration and Compatibility

### 16.1 Skyth-ts Compatibility
- How much of the Skyth-ts runtime should be directly portable? The ContextBuilder? The agent loop runner? The manifest registry? The delegation call stack?
- Should Skyth Next be able to read Skyth-ts session files?
- Should Skyth Next be able to load Skyth-ts agent manifests?

### 16.2 CLAUDE.md and AGENTS.md Compatibility
- Should Skyth Next load CLAUDE.md files for compatibility with Claude Code and Pi ecosystems?
- Should the AGENTS.md format be standardized, or remain free-form markdown?

### 16.3 MCP Compatibility
- Should Skyth Next be an MCP client (consume MCP tools), an MCP server (expose itself as a tool), or both?
- If MCP server: what capabilities does Skyth Next expose via MCP?

---

## 17. Novel Synthesis Questions

These questions arise specifically from the goal of combining the best of all harnesses into one novel system.

### 17.1 Contradictory Best Practices
- Pi says "keep core minimal, push to extensions." OpenCode says "ship workflows in core." These are directly contradictory. What is Skyth Next's answer?
- Claude Code says "one powerful loop." Codebuff says "many specialized agents." These are different bets on agent architecture. Which does Skyth Next take, or is there a synthesis?
- Hermes says "one big god runtime." Pi says "many small packages." Skyth-ts achieved small files. How does Skyth Next maintain small files while incorporating features from harnesses that could not?

### 17.2 Feature Prioritization
- Not everything can be built at once. What is the priority order?
  - Core loop with compaction and recovery?
  - Multi-agent delegation?
  - Channel support?
  - Long-term memory?
  - Extension/plugin system?
  - Rich TUI?
  - Gateway/service mode?
- What is the minimum viable Skyth Next that proves the architectural thesis?

### 17.3 Competitive Differentiation
- If Skyth Next takes the best of everything, what makes it more than "just another harness"?
- What novel capability does Skyth Next have that no existing harness possesses?
- Is the differentiation in the synthesis itself (best combination), in a novel capability, or in the architecture quality (cleanest implementation of known ideas)?

### 17.4 Performance and Efficiency
- Claude Code invests heavily in startup latency, lazy imports, and cache-key stability. What is Skyth Next's performance budget?
- What is the acceptable cold-start time? Hot-start time?
- Should prompt-cache efficiency be a measurable KPI?

### 17.5 Quasar Integration
- The Quasar directory exists in the repo as a Rust project. What is Quasar's role relative to Skyth Next?
- Is Quasar the memory/persistence layer? A separate runtime component? A planned future subsystem?
- How does the TypeScript harness interact with a Rust component? FFI? IPC? HTTP?

### 17.6 Architecture Validation
- How do we know the architecture is right before building too much? Spike? Proof-of-concept? Design review?
- What are the failure modes of the synthesis approach? Where might combining ideas from different harnesses create contradictions or unnecessary complexity?
- Should there be an explicit architecture decision record (ADR) for each major design choice?

---

## Summary of Critical Decision Points

The following decisions gate everything else and should be resolved first:

1. **Kernel scope** -- What is core vs. extension? (Section 1.1)
2. **Runtime shape** -- Single package with module boundaries vs. multi-package stack? (Section 1.2)
3. **Gateway orientation** -- Agent-first, gateway-first, or dual-mode? (Section 1.3)
4. **Compaction strategy** -- Which layers, who owns them? (Section 3.1)
5. **Memory model** -- Session-local vs. cross-session long-term? (Section 4.1)
6. **Delegation model** -- Skyth-ts safety + what additional formality? (Section 5.1)
7. **Provider abstraction** -- Internal message type and provider-adaptive prompts? (Section 6.1, 6.2)
8. **Extension scope** -- How far can extensions reach? (Section 11.1)
9. **Feature priority** -- What ships first? (Section 17.2)
10. **Quasar role** -- How does the Rust component fit? (Section 17.5)
