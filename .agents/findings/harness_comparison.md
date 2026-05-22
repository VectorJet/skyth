# Agent Harness Comparison: Complete Analysis

**Harnesses covered:** Claude Code · Codebuff · Hermes · Nanobot · OpenClaw · OpenCode · OpenHarness · Pi (pi-mono) · Skyth-py (legacy) · Skyth-ts (legacy)

**Dimensions analysed:** Architecture philosophy · AX (Agent Experience) · UX (User Experience) · DX (Developer Experience) · Context & memory management · Multi-agent model · Tool system · Complexity & file size · Stack

---

## 1. Quick Reference Table

|Harness|Stack|Primary purpose|Architecture pattern|Agent philosophy|
|---|---|---|---|---|
|**Claude Code**|TypeScript/Bun|Coding agent runtime|Single loop + many transports|Maximum resilience, one powerful loop|
|**Codebuff**|TypeScript/Bun|Coding assistant with specialists|Multi-agent + SDK + CLI|Orchestrator + role-based specialists|
|**Hermes**|Python|Personal agent platform|Monolithic runtime + gateway|One massive god-runtime, many surfaces|
|**Nanobot**|Python|General agent harness|Message bus + plugin channels|Compact loop with layered memory|
|**OpenClaw**|TypeScript|Persistent assistant platform|Gateway-first, embedded Pi runtime|Agent runs inside a control plane|
|**OpenCode**|TypeScript/Bun|Client/server coding platform|Evented session + server|Workflow-baked agent with clients|
|**OpenHarness**|Python|Harness framework|Named subsystems, governance-first|Framework, not a minimal kernel|
|**Pi**|TypeScript/Bun|Coding harness toolkit|Layered packages, extension-first|Minimal kernel + extension ecosystem|
|**Skyth-py**|Python (legacy)|Full-stack agent app (legacy)|FastAPI + Next.js + registries|Registry-driven, no unified runtime|
|**Skyth-ts**|TypeScript/Bun (legacy)|Cross-platform agent platform (legacy)|Gateway + central runtime + bus|Strongest legacy, manifest-validated|

---

## 2. Architecture Philosophy

Each harness answers the same basic question — "what is an agent runtime?" — in a fundamentally different way. Understanding the answer unlocks all the design decisions that follow.

### 2.1 Claude Code — The Maximally Hardened Loop

Claude Code's architectural thesis is that you need exactly one extremely capable turn-execution kernel, and then you wrap it in as many surfaces as you need. The kernel (`QueryEngine` + `query.ts`) runs the actual model/tool loop, handles compaction, fallback, token budget management, and context recovery. Everything else — TUI, headless mode, remote-control bridge, SSH-backed sessions, MCP — is a surface around that kernel.

This is a "one brain, many arms" design. The brain is ferociously capable and defensive. It contains multiple interacting safety nets: autocompact, reactive compact, history snip, microcompact, context collapse, tool-result budgeting, output-token escalation, prompt-too-long recovery, and fallback model retry. No other harness in the set has this many redundant recovery mechanisms layered into one loop.

### 2.2 Codebuff — The Specialist Orchestra

Codebuff starts from a different premise: a single general agent is not the best coding agent. The product idea is that an orchestrator dispatching to specialized subagents — editor, thinker, reviewer, file-picker, basher — produces better results than one agent doing everything.

This is encoded directly into shipped agent definitions rather than just docs. The `base2` orchestrator, the constrained `editor` agent, the tool-free `thinker`, the read-only `reviewer` — these are real code objects with distinct identities, tool allowlists, and runtime behaviors.

Codebuff also introduces a hybrid agent runtime: agents can run both LLM steps and programmatic generator steps (`handleSteps()`), allowing deterministic orchestration to interleave with LLM reasoning.

### 2.3 Hermes — The Personal Agent Operating Environment

Hermes is not trying to be a coding harness. It is trying to be a self-hosted personal agent that can live in your terminal, your messaging apps, your cron schedule, and your systemd service list simultaneously. It supports Telegram, Discord, WhatsApp, Slack, Signal, Matrix, and more — all as first-class runtime surfaces.

Its architecture is three massive centres of gravity: `run_agent.py` (9,858 lines) for the agent runtime, `gateway/run.py` (7,689 lines) for the messaging gateway, and `hermes_cli/main.py` (5,655 lines) for the product shell. Each of these is essentially a sub-platform. Hermes is not compact; it is comprehensive.

### 2.4 Nanobot — The Clean Compact Kernel

Nanobot is the most architecturally legible harness in the set. It solves the "many surfaces, one brain" problem with a message bus: channels publish `InboundMessage` events, the agent loop consumes them, and outbound results go back through `ChannelManager`. The bus cleanly decouples transport from execution.

Its core is intentionally small (4,659 lines of core runtime), though channel implementations add significant bulk. The memory model is two-layered (live sessions + `Dream`-curated long-term files), and the provider abstraction normalizes all backends behind `LLMResponse`/`ToolCallRequest`.

### 2.5 OpenClaw — The Control Plane That Hosts Agents

OpenClaw inverts the framing. Instead of "here is an agent that has many surfaces," it says "here is a persistent gateway that hosts agent runs." The gateway owns session state, auth, channel routing, plugin runtime, secrets, and automation. The agent is a managed workload inside it — specifically, `runEmbeddedPiAgent()` dispatched through `agentCommandInternal()`.

This is the most infrastructure-oriented harness in the set. It is not trying to be a better coding assistant; it is trying to be an assistant operating environment that can persist across channels, devices, and protocols.

### 2.6 OpenCode — The Workflow-Baked Platform

OpenCode is to Pi what a productized Rails app is to Rack. Pi gives you clean primitives; OpenCode ships the workflow. It includes built-in `build` and `plan` agents, a `task` delegation tool, a `todowrite` tool, doom-loop detection, permission ask/allow/deny, compaction with a dedicated hidden `compaction` agent, LSP integration, and an ACP server — all in core.

It also separates concerns through a server/client architecture: a Hono control-plane server manages session state, emits bus events, and routes workspace requests, while multiple client types (TUI, desktop, web, ACP) consume those events.

### 2.7 OpenHarness — The Explicit Framework

OpenHarness self-consciously tries to be what Claude Code is, but open, layered, and governable. It has named subsystems for everything: `engine`, `prompts`, `permissions`, `hooks`, `plugins`, `skills`, `memory`, `tasks`, `coordinator`, `swarm`, and `channels`. It uses Pydantic everywhere for type safety and ships a React terminal UI with a clean JSON-lines protocol backend.

It is the most "framework-brained" harness in the set — the most layers, the most explicit abstraction boundaries, and the heaviest governance posture.

### 2.8 Pi — The Minimal Harness Kernel

Pi's philosophy is stated plainly: no built-in MCP, no built-in subagents, no built-in plan mode, no built-in permission popups. These are extension territory. The core (`packages/ai` → `packages/agent` → `packages/coding-agent`) stays small and layered. Extensions, skills, prompt templates, themes, and pi packages add everything else.

This makes Pi the strongest "build on me" harness in the set. The SDK, RPC mode, and extension API together let developers embed or reshape the harness without forking core.

### 2.9 Skyth-py (Legacy) — The Transitional App

The Python legacy is best understood as a transitional full-stack agent product: more ambitious than a simple harness, but not yet consolidated into a disciplined runtime architecture. It already thinks in registries (agents, tools, pipelines, apps discovered from filesystem manifests), but the runtime is a FastAPI route calling a chosen agent — not a true orchestration engine. The MCP layer exists but depends on a mutable global cache. The mem0 memory integration exists but is not injected into active prompts.

### 2.10 Skyth-ts (Legacy) — The Strongest Legacy

The TypeScript legacy is the more mature of the two legacy harnesses. It has a genuine central runtime (`agent_loop_runner.ts`), a deliberate `ContextBuilder` with layered prompt assembly, manifest validation in the registry layer, delegation call-stack safety, and a session graph model. The architecture anticipates the Quasar/LGP vision from specs. Its weakness is that the surrounding product surfaces — especially the web UI — were still catching up when archived.

---

## 3. AX: Agent Experience

"Agent experience" means what the model actually sees, how the tool loop works, what context is available, how compaction is handled, and how the harness keeps the agent from going off the rails.

### 3.1 Prompt Construction

|Harness|System prompt composition|Context richness|
|---|---|---|
|Claude Code|`fetchSystemPromptParts()` assembles tool-filtered sections; prompt-cache stability is an explicit engineering goal|High; sections are carefully ordered and cached|
|Codebuff|Template-driven via `mainPrompt()`; each agent type has its own system/instructions/step prompts|Very high; agents have layered multi-section prompts|
|Hermes|`SOUL.md`, memory, skills, session-search, provider guidance, platform hints — all assembled in `run_agent.py`|Very high but concentrated in one massive runtime|
|Nanobot|`ContextBuilder.build_messages()`; system has identity + workspace bootstraps + memory + skills; runtime metadata injected into user message (anti-injection)|Medium-high; clean layered assembly|
|OpenClaw|`system-prompt.ts`; tool inventory + skills + memory + sender info + time + TTS hints + ACP constraints + multi-mode (`full`/`minimal`/`none`)|Very high; most infrastructure-aware prompt|
|OpenCode|Provider-adaptive: Anthropic/GPT/Gemini/Codex variants; environment block + skill list + agent override + plugin transforms|High; model-family-specific templates|
|OpenHarness|CLAUDE.md discovery + memory + skills + environment block + governance rules; very rich|Very high; closest to Claude Code's prompt depth|
|Pi|Base prompt + available tools + project context files (AGENTS.md/CLAUDE.md) + skills + date/cwd; intentionally minimal|Medium; clean and predictable|
|Skyth-py|No shared context builder; prompt depends on which agent the router picked; no standardized metadata block|Low; inconsistent across agents|
|Skyth-ts|`ContextBuilder`: identity + behavior factors + workspace bootstraps (SOUL.md, AGENTS.md, TOOLS.md, IDENTITY.md, USER.md) + memory + skills + gateway context + session primer|High; most deliberate of the legacy harnesses|

**Takeaway:** Claude Code, OpenClaw, OpenHarness, and Hermes have the richest prompt stacks. Pi is intentionally terse. Skyth-py is the weakest, with no shared prompt contract.

### 3.2 Tool Loop Quality

|Harness|Loop sophistication|Key differentiators|
|---|---|---|
|Claude Code|Extremely high|Autocompact, reactive compact, history snip, microcompact, context collapse, tool-result budgeting, max-output-token escalation, prompt-too-long recovery, fallback model retry, stop hooks|
|Codebuff|High + unique|Hybrid: LLM steps + programmatic generator steps (`handleSteps`); generators can yield tool calls deterministically|
|Hermes|High|Parallel tool execution (path-scoped analysis), iteration budgets, delegation depth tracking, code-execution tool to reduce round trips|
|Nanobot|Solid|Schema-driven validation, concurrent safe tools, runtime checkpoints for interrupted turns, orphaned-result recovery|
|OpenClaw|High|Auth-profile rotation, provider failover, overflow and compaction retries, timeout/rate-limit backoff; runs in serialized session lanes|
|OpenCode|High|Doom-loop detection (repeated identical tool calls), permission check on every tool, rich message/part model (text/reasoning/tool/step/patch/compaction)|
|OpenHarness|High|Hook execution before/after every tool call, permission evaluation (allow/deny/confirm), auto-compaction and microcompact, multi-agent task dispatch|
|Pi|Clean|Steering + follow-up queues baked into loop; agentLoopContinue() for seamless resumption; provider-normalized internally|
|Skyth-py|Basic|Simple loop in MasterAgent; no retry, checkpoint, or compensation; streaming tool-call accumulation marked as simplified|
|Skyth-ts|Solid|Tools disabled on final step; retry with backoff; degraded-mode fallback; repeated tool-call signature detection; streamed events via callback interface|

### 3.3 Compaction & Context Management

|Harness|Compaction model|
|---|---|
|Claude Code|Six-layer stack: tool-result budget → history snip → microcompact → context collapse → autocompact → reactive compact|
|Codebuff|Specialized `context-pruner` agent spawned before every orchestrator step; summarizes user/assistant/tool history differently; rewrites messages via `set_messages`|
|Hermes|Single LLM-based summarization; no layered approach documented|
|Nanobot|`Consolidator` summarizes older slices into `memory/history.jsonl`; `Dream` edits durable files (SOUL.md, USER.md, MEMORY.md)|
|OpenClaw|Inherited from embedded Pi runtime; overflow/compaction retries in `runEmbeddedPiAgent()`|
|OpenCode|Multi-stage: prune old tool outputs → compaction marker → hidden `compaction` agent summarizes → replay latest user context|
|OpenHarness|Token estimation → microcompact old tool results → full LLM-based summarization → preserve recent messages + carryover metadata; reactive on prompt-too-long errors|
|Pi|Token estimation → find cut point → summarize older branch/history → persist compaction entry in session JSONL; session-tree-aware|
|Skyth-py|None meaningful|
|Skyth-ts|Session compaction checks against context limits; compaction hooks exist; session primers reinjected|

**Takeaway:** Claude Code has the most mechanically redundant compaction stack. OpenCode's multi-stage pipeline is workflow-aware. Pi's compaction is tightly integrated with the session tree. Codebuff's approach of making the pruner itself a specialized agent is architecturally distinctive. Skyth-py has essentially nothing.

### 3.4 Memory Architecture

|Harness|Memory model|
|---|---|
|Claude Code|Per-session transcript only; compaction preserves summary; no cross-session long-term memory in the analysed harness|
|Codebuff|Rich `SessionState` with precomputed project context (file tree, token scores, git, knowledge files, skills); no persistent long-term memory across runs|
|Hermes|Disk-backed MEMORY/USER files; memory manager abstraction; external provider plugins; pre-reset memory flush via tool-limited flush agent; FTS5-backed session search as a tool|
|Nanobot|Two layers: live session JSONL + `Dream` periodic curation of SOUL.md/USER.md/MEMORY.md from `Consolidator` history summaries|
|OpenClaw|Skills per agent-scope; session transcript per scoped agent; memory prompt injected via system-prompt assembly|
|OpenCode|Session-local part model; no dedicated long-term memory subsystem|
|OpenHarness|Memory prompt + relevant file excerpts; skill system; session persistence; memory module is a named subsystem|
|Pi|Session-tree JSONL + branch summaries + compaction entries; no dedicated long-term cross-session memory|
|Skyth-py|SQLite transcript replay; mem0/Qdrant integration present but not injected into active prompts|
|Skyth-ts|SQLite event log + daily summaries + MENTAL_IMAGE notes + session primers reinjected into future conversations|

**Takeaway:** Hermes and Nanobot have the deepest long-term memory architectures. Skyth-ts has the most ambitious memory design of the two legacy harnesses. Most coding-focused harnesses (Claude Code, OpenCode, Pi) are session-local only.

### 3.5 Multi-Agent Model

|Harness|Multi-agent support|Design character|
|---|---|---|
|Claude Code|Worktree + coordinator features; background sessions; remote-control; no explicit specialist spawning in analysed loop|Concurrent workstreams, not role-based specialists|
|Codebuff|First-class: base2 orchestrator + editor + thinker + reviewer + file-pickers + basher + context-pruner|Specialist-role model; agents have distinct tool allowlists|
|Hermes|`delegate_task` + per-subagent iteration budgets + depth tracking + active child agent list|Personal-agent model; delegation bounded, not specialist-role|
|Nanobot|`spawn` tool → `SubagentManager` → separate `AgentRunner` (no `message`/`spawn`, 15 iteration cap)|Light; subagents are reduced-capability workers|
|OpenClaw|Parallel isolated top-level agents (different workspaces/auth/sessions) + spawned subagents (`run` vs `session` mode); lifecycle-tracked registry|Most formal multi-agent architecture in the set|
|OpenCode|`task` tool → child sessions → `SessionPrompt.prompt()` in child; task IDs resumable; permission-filtered by agent type|Real and session-based; very capable|
|OpenHarness|Background shell + agent tasks; coordinator mode; swarm/team lifecycle; in-process teammates|Broadest taxonomy: local/remote/in-process|
|Pi|None built in; extension territory|Intentional omission|
|Skyth-py|Router picks one agent per request; no delegation tree|Selection, not delegation|
|Skyth-ts|`SubagentManager` + `DelegationCallStack` (depth limiting, circular prevention, blocking subagent-to-subagent)|Safest delegation model in the legacy set|

**Takeaway:** OpenClaw has the most formally engineered multi-agent infrastructure. Codebuff has the most product-opinionated specialist model. Skyth-ts has the best delegation safety. Pi consciously avoids multi-agent complexity in core.

---

## 4. UX: User Experience

### 4.1 Interaction Surfaces

|Harness|Primary surfaces|
|---|---|
|Claude Code|TUI/REPL · headless/SDK/`--print` · remote-control bridge · direct-connect · SSH-backed sessions · background sessions|
|Codebuff|CLI TUI (OpenTUI+React) · modes (DEFAULT/MAX/PLAN/FREE) · project picker · SDK embedding|
|Hermes|Interactive CLI · Telegram/Discord/WhatsApp/Slack/Signal/Matrix/more · OpenAI-compatible API server · MCP server · cron · systemd/launchd service|
|Nanobot|CLI (`nanobot agent`) · chat platforms (`nanobot gateway`) · OpenAI-compatible API (`nanobot serve`)|
|OpenClaw|WhatsApp/Telegram/Slack/Discord/Matrix/iMessage/more · WebChat + Control UI · CLI/TUI · macOS/iOS/Android nodes · ACP bridge|
|OpenCode|Local CLI/TUI · `opencode serve` headless · remote attach CLI · desktop/web clients · ACP stdio server|
|OpenHarness|Interactive CLI · print mode · Textual UI · React TUI (JSON-lines protocol) · `ohmo` personal agent · gateway channels|
|Pi|Interactive TUI · print mode · JSON mode · RPC (JSONL stdin/stdout) · SDK embedding|
|Skyth-py|Next.js chat UI · FastAPI backend|
|Skyth-ts|CLI · messaging channels · web gateway · WebSocket/RPC clients · SvelteKit onboarding UI|

### 4.2 Session Continuity

|Harness|Session model|
|---|---|
|Claude Code|Resumable sessions; transcript persistence; worktree session isolation; remote session continuity via bridge|
|Codebuff|Persistent local run state; continue previous chats; load most recent chat; explicit session IDs|
|Hermes|SQLite session DB with FTS5; session lineage via `parent_session_id`; DM/group/thread-aware routing; auto-reset policies|
|Nanobot|JSONL per `channel:chat_id`; unified session mode; interrupted-turn recovery from runtime checkpoints|
|OpenClaw|Per-agent scoped session store; cross-channel identity linking; DM/group/thread/cron isolation|
|OpenCode|Durable forkable shareable sessions; root/child sessions; archived sessions; revert metadata; diff summaries|
|OpenHarness|`latest.json` + named session files; markdown transcript export; `/resume` flows; UI session lists|
|Pi|Session-tree JSONL with branching; `/tree` navigation; `/fork`; labels/bookmarks; export to HTML|
|Skyth-py|UUID-backed sessions in SQLite; no real metadata table; titles are session IDs|
|Skyth-ts|Session graph with `channel:chatId` keys; cross-channel continuity; switch-merge handling; session compaction|

**Standouts:** Pi's session tree with branch navigation is the most innovative UX feature in the coding-agent space. OpenCode's forkable, shareable, archivable sessions are the most feature-complete. OpenClaw's cross-channel session model is the most appropriate for a persistent assistant.

### 4.3 Messaging & Channel UX

This category only matters for the non-coding-first harnesses.

|Harness|Channel UX quality|
|---|---|
|Hermes|Strongest: unified `MessageEvent` abstraction, media caching, typing indicators, per-session interrupt handling, thread/session routing rules, platform-specific delivery adapters|
|OpenClaw|Broadest surface: 15+ platforms, node/device capabilities (camera, canvas, screen record, location, voice wake), Control UI inspection|
|Nanobot|Solid: BaseChannel adapter contract, streaming deltas, voice transcription, QR-based login|
|OpenHarness|Good via `ohmo`; channel implementations are hardcoded rather than registry-driven|
|Skyth-ts|Strong intent: Telegram, WhatsApp, Discord, Slack, email, QQ, Feishu, DingTalk adapters; gateway is the product centre|

### 4.4 Permission & Approval UX

|Harness|Permission UX|
|---|---|
|Claude Code|Permission denials can hide tools from model entirely; approval flows survive remote transports|
|Codebuff|Sensitive file filter at send time (env files, keys, certs, SSH keys, terraform state)|
|OpenClaw|Owner-only tools with execution-time guards; tool policy per agent; allow/deny/group resolution|
|OpenCode|`Permission.ask()` → `allow/deny/ask`; pending matching requests auto-resolved; doom-loop detection|
|OpenHarness|Interactive approve/deny via React frontend protocol; path rules, command deny patterns, permission modes|
|Pi|None built in; extension territory|
|Nanobot|Workspace restriction (path sandboxing); shell denylist; optional bwrap sandbox|

---

## 5. DX: Developer Experience

### 5.1 Tool Authoring

|Harness|Tool model|Ease of authoring|
|---|---|---|
|Claude Code|`Tool.ts`: full UX/runtime object with permission checks, read-only/destructive/concurrency semantics, prompt rendering, UI state rendering, MCP metadata|Mature but heavyweight|
|Codebuff|Tool definitions + agent manifest; tools are part of agent identity|Easy if you understand the agent template model|
|Hermes|Self-registering modules; toolset-aware filtering; `model_tools.py` registry|Good registry pattern; centralized execution|
|Nanobot|Plain class with `name`/`description`/`parameters`/`execute()`; JSON Schema based|Easiest in the set; patterned and copyable|
|OpenClaw|Plugin-registered tools; owner-only wrapping; group tool policies|Good but requires understanding the plugin platform|
|OpenCode|`ToolRegistry` with built-ins + plugins + directory scan; tool context includes permission asker and metadata updater|Solid; model-aware tool exposure|
|OpenHarness|`BaseTool` + Pydantic input model → auto-generated JSON schema; `execute()` + `is_read_only()`|Very approachable; typed and patterned|
|Pi|Factory-based tool definitions; clean separation between tool instance and tool definition|Clean; good for both humans and AI coding agents|
|Skyth-py|Base classes exist; filesystem discovered; weak validation|Understandable but unfinished|
|Skyth-ts|Normalized OpenAI-style schemas; scope tracking (agent/global/workspace); workspace script wrapping|Solid; closest to production-quality in legacy set|

### 5.2 Extension/Plugin Architecture

|Harness|Extension model|Quality|
|---|---|---|
|Claude Code|Feature-gated build flags; runtime env gates; GrowthBook-style runtime gates|Powerful but internal-product oriented, not clean external extension API|
|Codebuff|Local `.agents` directory loading; agent authoring model (prompt + generator + tool list + provider routing)|Strong for workflow orchestration authoring|
|Hermes|Plugin hooks (pre/post tool, pre/post LLM, pre/post API, session lifecycle), tool registration, CLI command registration, entry-point plugins|Broad; practical rather than sandboxed|
|Nanobot|Channel plugins via Python entry points; provider registry; tool classes; skill markdown files; MCP servers|Best-documented plugin story; `CHANNEL_PLUGIN_GUIDE.md` is unusually concrete|
|OpenClaw|Plugin registry with channels, providers, speech/media, web, hooks, services, gateway methods, HTTP routes, commands, diagnostics — manifest-first loading|Richest plugin system in the set|
|OpenCode|Plugins with tool + text transforms + event subscriptions; config directories as programmable overlays; skills from remote indexes|Strong; config-dir-as-overlay is distinctive|
|OpenHarness|Plugins with skills + hooks + MCP server definitions + commands; Claude Code plugin convention compatibility|Very strong; intentionally compatible with Claude-style ecosystem|
|Pi|Extensions: register tools + commands + keybindings + UI components + overlays + lifecycle events + session manipulation + compaction; npm/git packages|Strongest coding-agent extension API in the set|
|Skyth-py|Manifest-based discovery without real validation|Aspirational; incomplete|
|Skyth-ts|Manifest validation with required fields, duplicate detection, deterministic discovery|Strongest registry in the legacy set|

### 5.3 SDK / Embedding Story

|Harness|SDK quality|
|---|---|
|Claude Code|SDK/control message model reused across headless, bridge, remote, direct-connect; single protocol surface|
|Codebuff|`CodebuffClient`: custom agents, custom tools, prior run continuation, project files injection, event streaming callbacks|
|Hermes|`AIAgent` constructed per-session; broad but monolithic|
|Nanobot|`/v1/chat/completions` (narrow compatibility); programmatic use via `AgentLoop.process_direct()`|
|OpenClaw|Plugin SDK with agent-runtime helpers; huge export map|
|OpenCode|`opencode serve` + Hono API + bus events + workspace routing; ACP for protocol interop|
|OpenHarness|React backend JSON-lines protocol; programmatic session submission|
|Pi|`createAgentSession()` SDK + JSONL RPC mode + multi-mode shared `AgentSession`|
|Skyth-py|None|
|Skyth-ts|Gateway + WebSocket/RPC|

### 5.4 Code Complexity & File Sizes

This is one of the most practically important DX dimensions. Big files hurt onboarding, refactoring safety, and AI coding-agent comprehension.

|Harness|Biggest files|Assessment|
|---|---|---|
|Claude Code|`main.tsx` 4,683 · `bridgeMain.ts` 2,999 · `query.ts` 1,729 · `QueryEngine.ts` 1,295|Extreme concentration in orchestrators; major DX cost|
|Codebuff|`chat.tsx` 1,525 · `run-agent-step.ts` 1,124 · `run.ts` 864 · `run-state.ts` 740|Manageable but real pressure in UI and runtime files|
|Hermes|`run_agent.py` 9,858 · `gateway/run.py` 7,689 · `hermes_cli/main.py` 5,655|Worst file-size situation in the set; extreme concentration|
|Nanobot|`cli/commands.py` 1,405 · `channels/feishu.py` 1,719 · `agent/runner.py` 761|Moderate; channel implementations are the biggest files|
|OpenClaw|`server.impl.ts` 1,559 · `pi-embedded-runner/run.ts` 1,440 · `subagent-spawn.ts` 931 · `agent-command.ts` 921|Heavy orchestrators but bounded|
|OpenCode|`session/prompt.ts` 1,912 · `provider/provider.ts` 1,609 · `config/config.ts` 1,580 · `session/index.ts` 892|Significant; provider and session files are pain points|
|OpenHarness|`commands/registry.py` 1,602 · `services/compact/__init__.py` 1,197 · `swarm/permission_sync.py` 1,168 · `cli.py` 1,387|Broad distribution of large files across subsystems|
|Pi|`interactive-mode.ts` 4,649 · `agent-session.ts` 3,059 · `package-manager.ts` 2,241 · `extensions/types.ts` 1,450|Ironic given Pi's minimalist philosophy; UI file is especially large|
|Skyth-py|`run_agent.py` 9,858* · medium-sized other files|*Shared with Hermes — confirms extreme concentration risk|
|Skyth-ts|`registries/tool_registry.ts` 348 · `session/manager.ts` 333 · `context/builder.ts` 318 · `agent_loop_runner.ts` 317|Best file-size discipline in the set; smallest core files|

**Takeaway:** Skyth-ts has the best file discipline. Hermes is the worst by a large margin. Claude Code has the most justified concentration (production performance engineering) but still imposes high onboarding cost.

### 5.5 Testing Posture

|Harness|Test coverage signal|
|---|---|
|Claude Code|Strong signal; production hardening evident in code even without test visibility|
|Codebuff|Good test coverage signals across CLI/SDK/runtime packages|
|Hermes|Light test presence relative to system size|
|Nanobot|Substantial suite: agent loop, channels, tools, providers, config, cron, security, API|
|OpenClaw|Strong operational and security testing; diagnostics tooling|
|OpenCode|Tests exist but not comprehensively documented in the analysis|
|OpenHarness|Extensive: API, auth, bridge, channels, commands, config, coordinator, engine, hooks, MCP, memory, ohmo, permissions, plugins, prompts, services, skills, swarm, tasks, tools, UI|
|Pi|Strong: `packages/ai`, `packages/agent`, `packages/coding-agent`, `packages/tui`|
|Skyth-py|Lightweight probes rather than assertions|
|Skyth-ts|51 test files including security-oriented pentest-style checks; strongest in legacy set|

---

## 6. Dimension-by-Dimension Rankings

These are subjective assessments based on the analysis. Treat them as directional signals, not verdicts.

### 6.1 AX (Agent Experience)

Ranked on: loop robustness, compaction quality, memory depth, multi-agent sophistication, prompt richness.

1. **Claude Code** — Unmatched loop resilience; six-layer compaction; production-hardened fallback
2. **OpenClaw** — Auth rotation, failover, serialized lanes, rich scoped agent identity
3. **Codebuff** — Unique hybrid loop; specialist-agent model is real and effective
4. **OpenCode** — Doom-loop detection, workflow-baked agents, rich part model, strong compaction
5. **OpenHarness** — Strong governance, hook system, multi-agent taxonomy, deep prompt assembly
6. **Hermes** — Iteration budgets, parallel tools, memory flush, session search as tool; weakened by concentration
7. **Pi** — Elegant minimal kernel; steering queues; session tree; compaction; intentionally sparse
8. **Nanobot** — Clean and thoughtful; checkpoints, layered memory, streaming; modestly scoped
9. **Skyth-ts** — Solid delegation safety, layered context; incomplete execution
10. **Skyth-py** — Registry ideas present; runtime is basic route-level orchestration

### 6.2 UX (User Experience)

Ranked on: surface breadth, session continuity, discoverability, channel/messaging quality.

1. **OpenClaw** — Broadest surface ever; nodes/devices; Control UI; omnichannel persistence
2. **Hermes** — Strong messaging UX; service management; profiles; API compatibility; cron
3. **Claude Code** — Startup performance; resumability; remote-control; SSH; multiple serious workflows
4. **OpenCode** — Multi-client; forkable sessions; plan/build modes; ACP; workspace routing
5. **Codebuff** — Polished TUI; mode system maps to real behavior; nested agent visualization
6. **OpenHarness** — Many surfaces; React protocol; ohmo personal agent; strong slash commands
7. **Nanobot** — Broad surface; good onboarding; streaming; practical for technical users
8. **Pi** — Session tree/branch UX is exceptional; package system; clean multi-mode story
9. **Skyth-ts** — Gateway-centric; cross-platform intent; incomplete frontend
10. **Skyth-py** — Next.js chat UI; scaffolded rather than complete

### 6.3 DX (Developer Experience)

Ranked on: extension story, tool authoring, SDK quality, file size, type discipline, test coverage.

1. **Pi** — Best extension API; cleanest package decomposition; strongest SDK/RPC; serious tests
2. **OpenClaw** — Richest plugin platform; manifest-first; broadest capability registration
3. **Nanobot** — Most approachable tool authoring; best-documented plugin guide; clean bus
4. **OpenHarness** — Strong types; broad extension seams; protocol-separated UI; extensive tests
5. **OpenCode** — Powerful plugin/hook system; config-dir overlays; event-driven client support
6. **Codebuff** — Strong custom-agent authoring; good SDK; real workflow generator model
7. **Skyth-ts** — Best file discipline; strongest manifest validation; good security posture
8. **Claude Code** — Strong tool contract + protocol reuse; hurt by giant files and heavy gating
9. **Hermes** — Good registry/toolset/plugin architecture; ruined by extreme file concentration
10. **Skyth-py** — Registry ideas; weak manifests; sys.path manipulation; insecure config

---

## 7. Cross-Cutting Themes

### 7.1 The "God File" Anti-pattern

Every harness eventually creates orchestrator files that absorb too much complexity. The worst offenders:

- Hermes `run_agent.py` at 9,858 lines — the most extreme case in the set
- Claude Code `main.tsx` at 4,683 lines
- Pi `interactive-mode.ts` at 4,649 lines (the irony)
- OpenCode `session/prompt.ts` at 1,912 lines

The harnesses that resist this best are **Skyth-ts** (core files under 350 lines each) and **Nanobot** (clean bus-based decomposition).

### 7.2 Provider Abstraction Quality

Handling multiple LLM providers without leaking provider-specific assumptions into the agent loop is harder than it looks. Best approaches:

- **Nanobot**: Normalizes output to `LLMResponse`/`ToolCallRequest`; loop is entirely provider-agnostic
- **Pi**: Internal `AgentMessage[]` separate from provider wire `Message[]`; provider adapters at boundary
- **OpenHarness**: Internal `ConversationMessage` with `ContentBlock` list; adapters per provider
- **OpenCode**: Provider-adaptive system prompt templates (distinct Anthropic/GPT/Gemini/Codex prompts); tool exposure varies by model family

### 7.3 Registry Design Quality

|Harness|Registry quality notes|
|---|---|
|Claude Code|`tools.ts` as single inventory source; deny-rule filtering; ordering for cache stability|
|Hermes|Self-registering tool modules; toolset-aware; platform-specific bundles|
|Nanobot|`ChannelRegistry` via Python entry points; provider registry; tool registry|
|OpenClaw|Plugin registry: tools, hooks, channels, providers, speech, web, routes, commands, diagnostics|
|OpenCode|`ToolRegistry` with built-ins + plugins + directory scan; model-aware exposure|
|OpenHarness|Plugin registry with manifests; skill registry; hook registry|
|Pi|`ResourceLoader` centralizes discovery; npm/git package system|
|Skyth-py|Filesystem manifest discovery; weak validation|
|Skyth-ts|Manifest validation with required fields, duplicate detection, deterministic order|

### 7.4 Prompt-Cache Awareness

Only a subset of harnesses treat prompt-cache stability as a first-class concern:

- **Claude Code**: Explicit ordering for cache stability; avoids random-path cache busting; tool ordering deliberately stable
- **OpenCode**: System prompt sections assembled in stable order; compaction designed to preserve cache-warm sections
- **Codebuff**: Context pruner explicitly checks prompt-cache miss conditions

This is a real production differentiator. Unstable prompt prefixes destroy cache efficiency and increase costs and latency.

### 7.5 Security Posture

|Harness|Strengths|Weaknesses|
|---|---|---|
|Claude Code|Deny rules hide tools from model; remote session continuity with permission propagation|—|
|Codebuff|Sensitive file filter at send time|Local execution model raises trust questions|
|Hermes|Profile isolation; toolset filtering|No deep sandboxing|
|Nanobot|Workspace restriction; shell denylist; optional bwrap; URL block list|Heuristic rather than deep|
|OpenClaw|Owner-only tools; tool policy enforcement; manifest-first plugin loading|Setup complexity can lead to misconfiguration|
|OpenCode|Central permission engine; doom-loop detection|No file-system sandboxing|
|OpenHarness|Explicit permission modes; path rules; command deny patterns; hook-based policy|Complex configuration surface|
|Pi|None built in|Intentional omission; extension responsibility|
|Skyth-py|Auth/JWT layer exists|Plaintext API token in committed MCP config; open CORS; weak authorization|
|Skyth-ts|Auth verification; prompt-injection test suite; fingerprint verification|Web UI still catching up to backend hardening|

---

## 8. Key Differentiators Per Harness

### Claude Code

**One thing no other harness does as well:** The six-layer compaction/recovery stack. When the context window fills or the model hits an error, Claude Code has more safety nets than any other harness — and they work without user intervention. This is the "keep the agent running at all costs" philosophy materialized in code.

### Codebuff

**One thing no other harness does as well:** The hybrid programmatic + LLM agent loop. Generator-based agents can yield tool calls deterministically, request multiple candidate completions, explicitly end turns, and set structured output — all without making a model call. This collapses multi-step deterministic workflows without burning tokens.

### Hermes

**One thing no other harness does as well:** The pre-reset memory flush. Before a session context is cleared, Hermes spawns a tool-limited memory flush agent that replays recent history and saves durable facts to disk. No other harness in the set proactively preserves memory before it would otherwise be lost.

### Nanobot

**One thing no other harness does as well:** The plugin documentation quality. `CHANNEL_PLUGIN_GUIDE.md` is the most concrete and actionable plugin guide in the set. Other harnesses have better extension systems but assume you can read source code to figure out how to use them.

### OpenClaw

**One thing no other harness does as well:** Agent scoping. An "agent" in OpenClaw has its own workspace, agentDir, session store, auth profiles, model defaults, skill filters, sandbox defaults, tool policy, and group-chat behavior — all backed by real storage and routing. Agent identity is not just a prompt difference; it is a full runtime partition.

### OpenCode

**One thing no other harness does as well:** The doom-loop detector. `SessionProcessor` tracks repeated identical tool calls and requests `doom_loop` permission before the agent digs itself deeper into a runaway loop. This is a simple but genuinely useful safeguard that many harnesses skip entirely.

### OpenHarness

**One thing no other harness does as well:** The React terminal UI frontend/backend protocol. A clean JSON-lines event/request protocol separates the rendering layer from the Python runtime. Frontend and backend can evolve independently, and the protocol is inspectable. No other harness in the set has this level of architectural separation for its terminal UI.

### Pi

**One thing no other harness does as well:** The session tree with branch navigation. Users can `/tree` to see branching conversation history, jump to prior branch points, continue from there, and label bookmarks. This turns agent conversations from a flat transcript into an explorable, resumable graph. It is the most genuinely innovative session UX in the set.

### Skyth-py

**Most valuable legacy insight:** The app/widget concept. The frontend is designed for mixed chat-plus-widget responses — YouTube, Spotify, stock data, Wikipedia widgets delivered alongside text. No other harness in the set explored this direction for rich response UX.

### Skyth-ts

**Most valuable legacy insight:** The delegation call stack safety model. `DelegationCallStack` enforces depth limits, prevents circular calls, and blocks subagent-to-subagent delegation as a class of problems. This is the safest delegation design in the set and a direct architectural ancestor of whatever multi-agent model gets built next.

---

## 9. Comparison Matrices

### 9.1 AX Capabilities

|Feature|Claude Code|Codebuff|Hermes|Nanobot|OpenClaw|OpenCode|OpenHarness|Pi|Skyth-py|Skyth-ts|
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
|Multi-layer compaction|✅|✅|➖|✅|✅|✅|✅|✅|❌|➖|
|Long-term cross-session memory|❌|❌|✅|✅|➖|❌|✅|❌|➖|✅|
|Parallel tool execution|❌|❌|✅|✅|❌|❌|❌|❌|❌|❌|
|Specialist multi-agent|➖|✅|➖|➖|✅|✅|✅|❌|❌|➖|
|Delegation safety (depth + circuit break)|➖|➖|✅|✅|✅|✅|➖|❌|❌|✅|
|Provider failover/rotation|✅|✅|✅|➖|✅|❌|✅|❌|❌|➖|
|Programmatic/generator agent steps|❌|✅|❌|❌|❌|❌|❌|❌|❌|❌|
|Doom/loop detection|❌|❌|❌|❌|❌|✅|❌|❌|❌|✅|
|Session search as tool|❌|❌|✅|❌|❌|❌|❌|❌|❌|❌|
|Rich prompt cache stability|✅|✅|❌|❌|✅|✅|❌|❌|❌|❌|

✅ = yes · ➖ = partial/limited · ❌ = no/not found

### 9.2 UX Capabilities

|Feature|Claude Code|Codebuff|Hermes|Nanobot|OpenClaw|OpenCode|OpenHarness|Pi|Skyth-py|Skyth-ts|
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
|Messaging platform channels|❌|❌|✅|✅|✅|❌|✅|❌|❌|✅|
|OpenAI-compatible API surface|❌|❌|✅|✅|❌|❌|❌|❌|➖|❌|
|MCP server exposure|✅|❌|✅|❌|❌|❌|❌|❌|❌|❌|
|Session branching / tree UX|❌|❌|❌|❌|❌|✅|❌|✅|❌|❌|
|Remote attach / multi-client|✅|❌|❌|❌|✅|✅|❌|✅|❌|✅|
|Service/daemon deployment|❌|❌|✅|❌|✅|❌|❌|❌|❌|✅|
|Cron / scheduled execution|❌|❌|✅|✅|✅|❌|✅|❌|❌|✅|
|Interactive permission dialog|✅|❌|❌|❌|✅|✅|✅|❌|❌|❌|
|ACP support|✅|❌|❌|❌|✅|✅|❌|✅|❌|❌|
|Multi-profile/persona UX|❌|❌|✅|❌|✅|❌|✅|❌|❌|➖|

### 9.3 DX Capabilities

|Feature|Claude Code|Codebuff|Hermes|Nanobot|OpenClaw|OpenCode|OpenHarness|Pi|Skyth-py|Skyth-ts|
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
|Clean embed/SDK story|✅|✅|❌|➖|➖|✅|➖|✅|❌|➖|
|Manifest-validated registries|❌|✅|❌|❌|✅|✅|✅|✅|❌|✅|
|Typed tool schemas (Pydantic/TS)|✅|✅|❌|✅|✅|✅|✅|✅|❌|✅|
|Strong test suite|✅|✅|❌|✅|✅|➖|✅|✅|❌|✅|
|Extension/plugin system|➖|✅|✅|✅|✅|✅|✅|✅|➖|➖|
|RPC/protocol embedding|✅|❌|❌|❌|✅|✅|✅|✅|❌|✅|
|Provider abstraction|✅|✅|✅|✅|✅|✅|✅|✅|✅|✅|
|File size discipline|❌|✅|❌|✅|✅|❌|➖|❌|✅|✅|
|Security hardening|✅|➖|➖|✅|✅|✅|✅|❌|❌|✅|
|Skill markdown system|✅|✅|✅|✅|✅|✅|✅|✅|❌|✅|

---

## 10. What Skyth Should Take (and Avoid) From Each

Given Skyth-ts is the closest architectural ancestor of the current build:

### Take From Claude Code

- The compaction layer-stack concept: tool-result budget → snip → microcompact → collapse → autocompact → reactive compact
- Prompt-cache stability engineering: stable tool ordering, section-level cache keys, avoiding random-path busting
- The `QueryEngine`/`query.ts` split: session harness vs execution kernel as two distinct objects

### Take From Codebuff

- The programmatic generator agent step model for deterministic orchestration
- Rich `SessionState` precomputed at session start (file tree, token scores, git, knowledge files)
- The `context-pruner` as a specialized agent concept (vs. built-in compaction logic)

### Take From Hermes

- Pre-reset memory flush agent: tool-limited short-lived agent that saves durable facts before context is cleared
- FTS5-backed session DB with session search as a native tool capability
- Toolset abstraction as a policy bundle (platform-specific + scenario-specific tool bundles)

### Take From Nanobot

- The message bus for channel/agent decoupling
- Channel plugin entry-point discovery + concrete plugin guide
- Runtime metadata injected into user message (not system prompt) with explicit anti-injection labelling
- Interrupted-turn recovery via runtime checkpoints

### Take From OpenClaw

- Agent scoping: workspace + auth + session store + skill filters as persistent per-agent state
- Manifest-first plugin loading with diagnostics before runtime code executes
- Subagent spawn with workspace inheritance, thread binding, and lifecycle hook integration

### Take From OpenCode

- Doom-loop detection (repeated identical tool call signatures)
- Permission engine as a central runtime concern (not scattered across tools)
- Session part model (text/reasoning/tool/step-start/step-finish/patch/compaction as distinct part types)

### Take From OpenHarness

- React TUI backend/frontend JSON-lines protocol (clean UI/runtime separation)
- Hook engine with command/HTTP/prompt hook types for lifecycle interception
- CLAUDE.md compatibility in context loading

### Take From Pi

- Session tree with branching: `parentId`-linked JSONL entries; `/tree` navigation; compaction entries as nodes
- Steering + follow-up message queue built into the agent loop
- Clean three-package decomposition: AI layer → agent loop layer → coding-harness layer
- `createAgentSession()` SDK + JSONL RPC mode as dual embedding strategies

### Avoid From Skyth-py

- `sys.path.append()` as import discipline
- Print-based error handling
- Plaintext secrets in committed config files
- Open CORS
- Route-level orchestration as the only runtime coordinator
- Frontend event expectations that are not guaranteed by backend contracts

### Do Not Regress From Skyth-ts

- Manifest validation with required fields, duplicate detection, deterministic discovery order
- `DelegationCallStack` with depth limits, circular-call prevention, and subagent-to-subagent blocking
- Deliberate `ContextBuilder` with layered prompt assembly and channel-awareness
- Security test suite including prompt-injection static analysis
- Core files under 350 lines each (do not let orchestrators bloat)

---

## 11. Final Summary

The ten harnesses span a wide philosophical and architectural space. Mapping them into a 2×2 helps:

```
                    BROAD SURFACE
                         │
             Hermes       │      OpenClaw
             OpenHarness  │      (omnichannel platform)
                          │
SINGLE─────────────────────────────────────── SPECIALIZED
AGENT                     │                   MULTI-AGENT
                          │
             Nanobot       │      Codebuff
             Pi            │      OpenCode
                          │
                    NARROW/CODING
```

Claude Code sits off this chart — it is specialized (coding) but uniquely deep on loop resilience rather than surface breadth. Skyth-ts and Skyth-py are transitional and don't fit cleanly.

**If you want the best coding agent loop:** Claude Code. **If you want the cleanest extension platform:** Pi. **If you want the best multi-specialist orchestration:** Codebuff. **If you want the widest omnichannel surface:** OpenClaw. **If you want the best personal agent deployment story:** Hermes. **If you want the best client/server coding platform:** OpenCode. **If you want the most explicit governance and framework:** OpenHarness. **If you want the cleanest compact harness core:** Nanobot. **If you want the best legacy architectural DNA for Skyth:** Skyth-ts.