# Legacy Skyth TypeScript Harness Exploration

## Scope

This document explores `legacy(ts)` as an AI agent harness at the code level, with emphasis on:

1. AX: agent experience
2. UX: user experience
3. DX: developer experience

This is an exploration document, not a ranking.

## What Legacy Skyth TypeScript Is

Legacy Skyth TypeScript is a Bun-first multi-surface agent runtime built around:

- a CLI command system
- a gateway server that mediates channels, web, and RPC-style clients
- a centralized base-agent runtime with context building, tool execution, session management, and recovery logic
- manifest-validated registries for agents and other extensible modules
- workspace-local memory/session storage with SQLite-backed event logging
- channel adapters for web, Telegram, Discord, Slack, WhatsApp, email, and others
- a partially built SvelteKit web platform

The main runtime pieces are:

- CLI entry in `legacy(ts)/skyth/cli/main.ts`
- gateway command in `legacy(ts)/skyth/cli/runtime/commands/gateway/index.ts`
- runtime message processing in `legacy(ts)/skyth/base/base_agent/runtime/message_processor.ts`
- shared agent loop in `legacy(ts)/skyth/base/base_agent/runtime/agent_loop_runner.ts`
- context assembly in `legacy(ts)/skyth/base/base_agent/context/builder.ts`
- provider abstraction in `legacy(ts)/skyth/providers/`
- tool registry in `legacy(ts)/skyth/registries/tool_registry.ts`
- manifest registry in `legacy(ts)/skyth/core/registry.ts`
- session storage in `legacy(ts)/skyth/session/manager.ts`
- event memory backend in `legacy(ts)/skyth/memory/backends/static_sqlite.ts`
- gateway HTTP layer in `legacy(ts)/skyth/gateway/server/http.ts`
- channel runtime in `legacy(ts)/skyth/channels/manager.ts`

Representative file sizes:

- `legacy(ts)/skyth/registries/tool_registry.ts`: 348 LOC
- `legacy(ts)/skyth/session/manager.ts`: 333 LOC
- `legacy(ts)/skyth/base/base_agent/context/builder.ts`: 318 LOC
- `legacy(ts)/skyth/base/base_agent/runtime/agent_loop_runner.ts`: 317 LOC
- `legacy(ts)/skyth/providers/ai_sdk_provider.ts`: 317 LOC
- `legacy(ts)/platforms/web/src/routes/onboarding/+page.svelte`: 371 LOC

Repository scale snapshot:

- `legacy(ts)/skyth/`: 395 files
- `legacy(ts)/tests/`: 51 files
- `legacy(ts)/platforms/web/src/`: 64 files

This harness is significantly more architecturally mature than the Python version. It has stronger contracts, better layering, and broader platform intent, even though some UI surfaces remain unfinished.

## Architectural Summary

```text
User
  |
  +-- CLI commands
  +-- Web app / onboarding
  +-- WebSocket / RPC gateway clients
  +-- Messaging channels
         |
         v
     ChannelManager
         |
         v
      MessageBus
     /         \
 inbound      outbound
    |             |
    v             v
processMessage  channel.send()
WithRuntime
    |
    +-- SessionManager
    +-- ContextBuilder
    +-- MemoryStore
    +-- ToolRegistry
    +-- SubagentManager
    +-- CronService
    +-- Provider
    |
    v
 runAgentLoop
    |
    +-- model call
    +-- tool execution
    +-- retry / degraded fallback
    +-- output sanitization
```

The important architectural point is that this version has a real central runtime. The Python version had extension systems; the TypeScript version has an integrated execution model around them.

## AX: Agent Experience

### 1. What the agent actually sees

The prompt is assembled centrally by `ContextBuilder` in `legacy(ts)/skyth/base/base_agent/context/builder.ts`.

The effective system prompt includes:

- identity prompt and tool-aware behavioral rules
- behavior factors with explicit priority ordering
- loaded workspace bootstrap files:
  - `AGENTS.md`
  - `SOUL.md`
  - `TOOLS.md`
  - `IDENTITY.md`
  - `USER.md`
  - `HEARTBEAT.md`
  - `BOOTSTRAP.md`
- durable memory from `memory/MEMORY.md`
- always-on skills content
- selected skills content
- a skills summary that tells the model to load `SKILL.md` files through tools when needed
- gateway/channel context
- optional session primer for continuity
- platform-switch notes when the conversation moved channels

This is a much more deliberate prompt contract than the Python harness.

### 2. Context window structure

A practical view of the message layout is:

```text
system
├─ identity prompt
├─ behavior factors
├─ workspace bootstrap files
├─ known identity facts
├─ durable memory
├─ always-on skills
├─ requested skills
├─ skills summary
└─ gateway context

history
├─ prior session messages from SessionManager
└─ trimmed by runtime memory window

optional system primer
└─ recent session primer from memory backend

current user message
├─ user text
└─ optional image file attachments as image_url blocks
```

Notable strengths:

- the runtime is channel-aware
- the model is told what channels are enabled and how to use the message tool
- workspace bootstrap is standardized
- onboarding completeness is reflected in prompt logic
- platform changes are explicit rather than inferred

This is one of the strongest parts of the TS harness.

### 3. How tool calling actually works

The shared loop lives in `legacy(ts)/skyth/base/base_agent/runtime/agent_loop_runner.ts`.

The loop is:

```text
build messages
call provider
if tool calls returned:
  add assistant tool-call message
  execute tool(s)
  append tool results
  continue
else:
  finalize answer
```

Key implementation details:

- tools are disabled on the final step to force closure
- provider failures are retried with backoff, especially for rate limits
- degraded-mode fallbacks exist if the model fails after tools already ran
- repeated tool-call signatures are tracked to detect loops
- tool results are added through the context layer, not ad hoc string concatenation
- streamed reasoning/text/tool events are surfaced through a shared callback interface

This is a real harness loop, not just a one-off agent implementation.

### 4. Tool registry model

`ToolRegistry` in `legacy(ts)/skyth/registries/tool_registry.ts` supports multiple tool sources:

- built-in/global tools under `skyth/tools`
- agent-local tools under `skyth/agents/*/tools`
- workspace tools discovered from a `tools/` directory
- converted legacy tools

Important behaviors:

- tool definitions are normalized into OpenAI-style function schemas
- tools can optionally validate parameters before execution
- workspace scripts can be wrapped automatically as command tools
- tool scope is tracked as `agent`, `global`, or `workspace`

This gives the agent a fairly rich, layered tool universe.

### 5. Delegation and subagents

Unlike the Python version, the TypeScript harness explicitly models delegation safety.

Relevant pieces:

- `SubagentManager` in `legacy(ts)/skyth/base/base_agent/delegation/manager.ts`
- `DelegationCallStack` in `legacy(ts)/skyth/base/base_agent/delegation/call_stack.ts`

The design includes:

- bounded delegation depth
- circular-call prevention
- explicit blocking of subagent-to-subagent delegation
- subagent completion routed back through the main bus as a system message

This is directly aligned with the repository’s current architecture direction.

Caveat:

- the visible shipped agent set is small, mainly a generalist plus subagent tooling
- the framework for delegation is more mature than the current breadth of actual specialist agents

### 6. Provider abstraction

Provider logic is split across `skyth/providers/`.

The main path uses `AISDKProvider`:

- resolves provider/model prefixes
- routes through AI SDK-compatible backends
- supports gateway providers like OpenRouter
- supports streamed text, reasoning, and tool-call events
- trims or retries when a provider produces no output

Provider registry support also includes:

- static provider metadata
- dynamic provider discovery from `models.dev`
- local caching under `~/.skyth/cache/models.json`

This is more modular than the Python provider layer and cleaner at the API boundary.

### 7. Memory from the agent’s point of view

The TS harness combines several memory shapes:

1. session transcript memory
2. durable `MEMORY.md`
3. event log memory in SQLite
4. session primers from prior session history
5. mental image updates for behavioral continuity

`StaticSqliteMemoryBackend` records:

- event rows in `memory/events.sqlite`
- daily summaries under `memory/daily/`
- mental-image notes in `memory/MENTAL_IMAGE.locked.md`

`SessionManager` separately stores JSONL chat/session logs under `sessions/`.

This is not yet the fully realized Quasar system described in specs, but it is already beyond the Python harness:

- events are structured
- daily summaries exist
- session compaction hooks exist
- session primers are reinjected into future conversations

### 8. Session graph and continuity

A distinctive feature here is the session graph model in `SessionManager`.

The runtime supports:

- session keying by `channel:chatId`
- cross-channel continuity
- switch-merge handling
- session compaction checks against model context limits
- optional auto-merge logic

This means the harness is trying to preserve continuity across surfaces, not just within one flat transcript.

That is a meaningful AX upgrade over the Python version.

## UX: User Experience

### 1. Main interaction surfaces

The TS harness supports several user-facing surfaces:

- CLI
- messaging channels
- web gateway
- RPC/WebSocket clients
- onboarding UI

The primary operational surface appears to be the gateway, not the Svelte app alone.

### 2. Channel-aware interaction model

`ChannelManager` initializes configured channels and routes outbound events to the right adapter.

Supported channels include:

- web
- Telegram
- WhatsApp
- Discord
- Slack
- email
- additional adapters such as QQ, Feishu, DingTalk, and MoChat in the tree

UX implication:

- the assistant is meant to persist across channels
- delivery targets are remembered
- channel-specific rules affect how the assistant should phrase and deliver output

This is a true cross-platform agent harness rather than a single chat app.

### 3. Gateway UX

The gateway exposes:

- health and status endpoints
- onboarding endpoints
- auth endpoint
- web chat ingress
- session list/history APIs
- WebSocket/RPC style request handling

This gives users and clients multiple control surfaces:

- direct web chat submission
- session history browsing
- remote method calls over the gateway
- channel-connected conversations

The gateway is the real product surface here.

### 4. Web UX state

The archived web platform under `platforms/web` is mixed in maturity.

What is substantial:

- onboarding UI with multi-step configuration
- Svelte 5 + Tailwind + shadcn-svelte component structure
- forms for provider, model, channel, websearch, and security setup

What is incomplete:

- the main homepage is still the default SvelteKit welcome page
- there is no equivalent polished chat UI wired here in the checked snapshot

So the frontend UX was still behind the backend/gateway runtime when this version was archived.

### 5. Streaming and delivery UX

The web channel supports:

- streamed text deltas
- streamed reasoning deltas
- tool-call and tool-result events
- final message events
- stream resets

It also keeps text and reasoning buffers per chat and throttles delta broadcasts. That is a more sophisticated streaming UX model than the Python SSE route.

### 6. Onboarding UX

Onboarding is a first-class product concern in this harness.

Signals of that:

- CLI onboarding commands
- web onboarding route
- onboarding metadata endpoint
- BOOTSTRAP-driven prompt behavior
- gateway startup checks around onboarding completion

This is a meaningful productization step. The system is trying to get from zero-config or partial-config states into a usable, secure setup with guided flows.

## DX: Developer Experience

### 1. Architectural strengths

For developers, the TS harness is strong in several ways:

- clear module boundaries
- manifest validation
- deterministic registry structure
- reusable runtime primitives instead of route-specific logic
- broad test coverage, including security-oriented tests
- Bun-native tooling and a coherent TypeScript codebase

This codebase is much closer to an intentional platform than the Python legacy line.

### 2. Registry and manifest quality

The registry layer is notably better than in Python.

`ManifestRegistry` and `manifest.ts` provide:

- required manifest fields
- validation errors with file and field context
- deterministic discovery order
- duplicate detection
- fail-open behavior for external discovery paths

This directly matches the repository’s current “registry + manifest” direction.

Example:

- `legacy(ts)/skyth/agents/generalist_agent/agent_manifest.json` includes `id`, `name`, `version`, `entrypoint`, `capabilities`, `dependencies`, and `security`

That is a real contract, not just metadata by convention.

### 3. Test posture

The TS harness has a much stronger test story than the Python version.

Observed traits:

- 51 test files
- focused tests for session graph behavior, tools, channels, auth, cron, memory, gateway delivery, and provider helpers
- pentest-style checks for static security patterns, prompt injection, gateway exposure, and deployment checklist items

This does not guarantee correctness, but it indicates the team was actively codifying platform behavior and security expectations.

### 4. Security and operational posture

Compared with Python, this version is visibly more security-aware:

- auth token and node verification flows exist
- gateway requests check trusted node/channel relationships
- prompt-injection and static-security tests exist
- device fingerprint verification is built into gateway startup
- onboarding includes explicit security acknowledgment and password strength checks

That said, some operational risks remain:

- provider metadata still depends on `models.dev`
- many systems rely on local files under the workspace and `~/.skyth/`
- the web surface is still incomplete, so UX hardening likely lagged runtime hardening

### 5. Areas that still feel transitional

Despite the stronger architecture, this is still an in-progress platform:

- the web app is not representative of backend maturity
- the quasar/LGP vision in specs is only partially materialized in code
- some files are approaching the repo’s large-file threshold
- there are traces of parallel evolutions across CLI, gateway, and platform workstreams

So this is mature in structure, but not fully complete as a product.

## Key Takeaways

### What Legacy Skyth TypeScript gets right

- It has a genuine central runtime contract.
- Prompt construction is explicit, layered, and channel-aware.
- Delegation safety is implemented as code, not just described in docs.
- Registry and manifest design are strong and aligned with the repo’s current direction.
- Session continuity and memory are treated as runtime concerns, not afterthoughts.
- Security and testing are much more serious than in the Python legacy line.

### What it does only partially

- full Quasar/LGP realization
- complete multi-platform frontend UX
- broad specialist-agent ecosystem
- polished end-user web chat surface

### What is most reusable for the current Skyth direction

- `ContextBuilder` prompt contract
- `runAgentLoop` recovery and tool-execution loop
- manifest validation and registry infrastructure
- channel/gateway delivery model
- session graph and compaction logic
- delegation call-stack safety model
- memory event logging and daily summary scaffolding

### What should not be copied forward as-is

- placeholder or unfinished web routes as product evidence
- overloading some large runtime files instead of continuing to split modules
- direct dependency on external provider catalogs without stronger caching/offline guarantees
- mixed completeness across surfaces that can make the system appear less finished than its backend actually is

## Bottom Line

Legacy Skyth TypeScript is the stronger of the two legacy harnesses as a platform architecture.

The Python version had the right instincts around registries, agents, tools, and MCP. The TypeScript version turns those instincts into a more coherent system:

- centralized runtime
- validated manifests
- guarded delegation
- channel-aware delivery
- structured memory/event handling
- stronger security posture

Its main weakness is not the runtime core. It is that the surrounding user-facing product surfaces, especially the archived web UI, were still catching up to the architecture underneath.

If the current Skyth rebuild is looking for the most reusable architectural DNA, `legacy(ts)` is the closer ancestor.
