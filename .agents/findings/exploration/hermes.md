# Hermes Agent Exploration

## Scope

This document explores `refs/hermes-agent` as an engineered harness, focusing on:

- AX — Agent experience
- UX — User experience
- DX — Developer experience

This is an exploration, not a ranking.

## What Hermes Agent Actually Is

At code level, Hermes Agent is not just a terminal coding assistant.

It is a **Python-first personal-agent platform** that combines:

- a very large single-agent runtime in `run_agent.py`
- a persistent SQLite session and search layer
- a gateway that spans many messaging platforms
- a toolset/tool-registry system with dynamic filtering
- subagent delegation and code-execution tools
- plugin- and MCP-based extension surfaces
- cron automation and background delivery
- profile-aware CLI and service management

The repository has a very broad ambition: a personal agent that can live in the terminal, in chat apps, in scheduled jobs, and behind an OpenAI-compatible HTTP server.

The core architectural difference from Claude Code, Pi, and OpenCode is this:

**Hermes puts a very large amount of system behavior into one central agent runtime file, then surrounds it with gateway/session/tooling infrastructure.**

## Core Architectural Thesis

Hermes appears to be engineered around five central ideas:

1. **One primary runtime owns most agent behavior**
   - `run_agent.py` contains the dominant execution model
   - many features are integrated directly into this runtime instead of being deeply split out

2. **Tools are the central capability surface**
   - tool registry discovery
   - toolsets as policy bundles
   - platform-specific toolset selection
   - programmatic code-execution and delegation on top

3. **Messaging gateway is first-class, not secondary**
   - Telegram, Discord, WhatsApp, Slack, Signal, Matrix, and more
   - gateway sessions are real durable state, not temporary wrappers

4. **Long-term memory and learning are product-defining behavior**
   - session DB + FTS search
   - memory stores and memory providers
   - skill creation / improvement framing
   - pre-reset memory flushes

5. **Configuration and distribution matter as much as the runtime**
   - profile-scoped homes
   - systemd/launchd service support
   - runtime provider routing
   - CLI setup and deployment flows are major architecture, not afterthoughts

## Key Files Read

### Core runtime
- `refs/hermes-agent/run_agent.py`
- `refs/hermes-agent/model_tools.py`
- `refs/hermes-agent/toolsets.py`
- `refs/hermes-agent/toolset_distributions.py`
- `refs/hermes-agent/hermes_state.py`

### Gateway/runtime surfaces
- `refs/hermes-agent/gateway/run.py`
- `refs/hermes-agent/gateway/session.py`
- `refs/hermes-agent/gateway/delivery.py`
- `refs/hermes-agent/gateway/hooks.py`
- `refs/hermes-agent/gateway/config.py`
- `refs/hermes-agent/gateway/platforms/base.py`
- `refs/hermes-agent/gateway/platforms/api_server.py`

### CLI / configuration / plugins
- `refs/hermes-agent/hermes_cli/main.py`
- `refs/hermes-agent/hermes_cli/gateway.py`
- `refs/hermes-agent/hermes_cli/plugins.py`
- `refs/hermes-agent/hermes_cli/runtime_provider.py`
- `refs/hermes-agent/mcp_serve.py`
- `refs/hermes-agent/README.md`
- `refs/hermes-agent/pyproject.toml`

## Architectural Character

Hermes is one of the broadest repos in the set, but unlike OpenClaw it is not gateway-first at the very top.

Instead, it feels like:

- a **big integrated agent runtime**
- plus a **big messaging gateway**
- plus a **big CLI/service/config shell**

In practice this means there are three major centers of gravity:

- `run_agent.py`
- `gateway/run.py`
- `hermes_cli/main.py`

Each of those files is huge, and each is acting like a subsystem root.

## High-Level Architecture

```text
CLI / services / integrations
├─ hermes (interactive CLI)
├─ gateway commands / service management
├─ MCP server
├─ OpenAI-compatible API server
├─ cron / batch / RL flows
└─ profiles / setup / auth / runtime provider routing
        |
        v
Primary runtime
├─ AIAgent in run_agent.py
├─ tool loop / prompt building / retry / failover
├─ memory + skills + checkpoint integration
├─ code execution + delegation
└─ conversation/session persistence
        |
        v
Tool system
├─ registry-discovered tools
├─ toolsets and platform tool bundles
├─ plugin-provided tools
├─ MCP-discovered tools
└─ terminal/browser/memory/session-search/etc.
        |
        v
Persistent state + delivery
├─ SQLite SessionDB + FTS5 search
├─ gateway sessions.json mapping
├─ transcripts / message replay
├─ messaging platform adapters
├─ delivery routing / cron outputs
└─ service/gateway process lifecycle
```

## File Size Reality

Representative large files:

- `run_agent.py` — ~9858 lines
- `gateway/run.py` — ~7689 lines
- `hermes_cli/main.py` — ~5655 lines
- `hermes_cli/gateway.py` — ~2343 lines
- `hermes_state.py` — ~1305 lines
- `gateway/session.py` — ~1082 lines
- `gateway/config.py` — ~1009 lines

This is a defining fact about the codebase.

Hermes is highly capable, but a lot of that capability is concentrated in extremely large files.

## AX: Agent Experience

## 1. The main agent abstraction is `AIAgent`

`run_agent.py` defines `AIAgent`, and this is clearly the dominant harness abstraction.

It owns or directly coordinates:

- model/provider selection
- conversation loop
- tool registration and execution
- iteration budgeting
- interrupt handling
- fallback providers
- memory integration
- session persistence
- checkpointing
- prompt caching
- code execution
- delegation/subagents
- context compression
- streaming callbacks
- gateway-oriented lifecycle state

In other words:

**Hermes has one very large "god runtime" object.**

That gives it power and convenience, but it also means many agent behaviors are tightly centralized.

## 2. Iteration budgeting is built in as a first-class control mechanism

`IterationBudget` is a notable design detail.

The runtime explicitly models:

- total iteration caps
- per-subagent independent budgets
- refund semantics for `execute_code`

This is stronger than a naive max-turn counter. It shows Hermes is trying to control both:

- runaway agent loops
- runaway delegation/code-execution overhead

That is a mature bounded-autonomy feature.

## 3. Parallel tool execution is a serious runtime concern

`run_agent.py` includes explicit analysis for whether a tool-call batch can run concurrently.

It distinguishes:

- never-parallel tools
- parallel-safe read/search tools
- path-scoped tools that can be concurrent only when paths do not overlap
- destructive command heuristics

That is impressive because many harnesses only have coarse sequential tool execution.

Hermes is explicitly trying to increase throughput while preserving correctness.

### Tool concurrency concept

```text
tool batch
├─ reject parallelism if any tool is globally unsafe
├─ allow parallel read/search tools
├─ allow path-scoped tools only when paths do not overlap
└─ otherwise fall back to sequential execution
```

## 4. Toolsets are a major part of agent identity

`toolsets.py` is not just a convenience file. It is a central policy model.

Hermes defines:

- category toolsets (`web`, `terminal`, `file`, `browser`, `memory`, `delegation`, etc.)
- scenario toolsets (`debugging`, `safe`)
- product/tooling toolsets (`hermes-cli`, `hermes-gateway`, `hermes-api-server`, `hermes-acp`, per-platform bundles)

This is an important design choice.

Instead of hardcoding one global tool inventory, Hermes makes the effective tool surface depend on:

- platform
- runtime surface
- optional plugins
- explicit enabled/disabled toolset filters

This gives the agent experience strong contextual shaping.

## 5. Tool discovery is registry-driven, but runtime integration is still centralized

`model_tools.py` shows a real registry pattern:

- tools self-register
- discovery imports tool modules
- MCP tools can be discovered
- plugins can register tools
- filtered schemas are generated per session

This is good architecture.

But Hermes then feeds all of this back into one dominant runtime object.

So the result is:

- **good capability registration**
- **less separation in the execution core**

## 6. Programmatic code execution is a notable differentiator

The runtime and toolsets include `execute_code`, with explicit comments that it reduces LLM round trips by letting scripts call tools programmatically.

That is a strong architectural idea.

It means Hermes can collapse some multi-step agent behavior into:

- one higher-level programmatic tool turn
- instead of many LLM-visible tool-call turns

This is somewhat analogous to Codebuff's programmatic steps, but Hermes exposes it directly as a tool capability in the main harness.

## 7. Delegation is part of the core product, not an experiment

Hermes exposes `delegate_task` and tracks subagent state in the main agent runtime.

The runtime includes:

- delegate depth
- active child agents
- interrupt propagation
- separate iteration budgets for subagents

This means delegation is not a thin wrapper. It is a built-in model of bounded nested autonomy.

Compared with OpenCode's task tool or Codebuff's specialists, Hermes feels more like a personal-agent system that happens to support subagents rather than a multi-agent product designed around specialists.

## 8. Memory is deeply embedded in the agent loop

Hermes has multiple memory-related layers visible in `run_agent.py`:

- disk-backed MEMORY / USER data
- memory manager abstraction
- external memory provider plugins
- memory nudges and flush policies
- pre-reset memory flush behavior

This is stronger than simple transcript recall.

The runtime tries to ensure memory survives session resets by proactively launching a tool-limited memory flush agent before context is lost.

That is a distinctive agent design choice.

### Memory-preservation path

```text
session nearing reset / auto-reset
  -> build short-lived flush agent
  -> replay recent history
  -> allow only memory / skills tools
  -> save durable facts before transcript context is cleared
```

This is one of Hermes's most interesting AX traits.

## 9. Session search is a native agent capability

`hermes_state.py` is not just persistence. It includes:

- SQLite storage for sessions and messages
- FTS5 full-text search
- session metadata
- lineage via `parent_session_id`
- title resolution / naming
- export and cleanup utilities

Because `session_search` is also a toolset/tool, the agent can reason over prior conversations as part of its action space.

That is a strong long-memory affordance.

## 10. Prompt construction is very rich, but concentrated

Even from the top of `run_agent.py`, we can see prompt assembly draws from many subsystems:

- identity/persona (`SOUL.md` and related prompt builder helpers)
- memory guidance
- session search guidance
- skills system prompts
- context files
- provider/model operational guidance
- platform hints
- tool-use enforcement rules

This suggests a very rich internal prompt model.

But because so much of it is ultimately orchestrated in one huge runtime, the predictability cost is real.

## 11. Fallback providers are first-class in runtime logic

Hermes's runtime and gateway both load fallback provider chains.

This is not just a CLI option. It is deeply integrated into:

- runtime provider resolution
- gateway execution
- API server execution
- agent instance construction

That gives Hermes strong survivability across provider failures, similar in spirit to OpenClaw's failover posture.

## 12. AX strengths

- very broad capability model inside one runtime
- strong bounded-autonomy controls via iteration budgets and delegation depth
- real support for concurrent safe tool execution
- memory is deeply productized, not bolted on
- session search and cross-session recall are built into the platform story
- toolsets provide a flexible way to tailor the agent surface by environment
- fallback providers and credential pools are first-class runtime concepts

## 13. AX weaknesses

- core agent logic is extremely concentrated in one massive file
- the mental model is difficult because prompting, tools, memory, failover, and platform behavior are tightly interwoven
- changes to the central runtime likely have large blast radius
- because so much behavior is integrated directly, the execution core feels less composable than Pi/OpenCode

## UX: User Experience

## 1. Hermes is truly multi-surface

The README's broad product claim is substantially backed by code.

Hermes supports:

- interactive CLI
- messaging gateway across many platforms
- OpenAI-compatible API server
- MCP server
- cron delivery
- service-mode deployment via systemd/launchd

This gives Hermes a wider everyday UX surface than coding-only harnesses.

## 2. CLI/product shell is a major subsystem

`hermes_cli/main.py` is enormous because Hermes treats CLI UX as a serious product surface.

It includes:

- profile pre-parsing before imports
- first-run provider checks and setup gating
- session browse / resume flows
- provider selection and model selection
- auth provider flows
- gateway management commands
- update/uninstall flows
- WhatsApp setup flow
- fallback picker UIs
- TTY safety checks

This is a lot more operational UX than most harnesses expose.

## 3. Profile-aware homes improve multi-agent/multi-persona UX

The early profile override logic in `hermes_cli/main.py` is important.

Hermes can map a selected profile to a distinct `HERMES_HOME` before the rest of the app imports.

That matters because a lot of modules cache home-relative paths at import time.

So this is not cosmetic. It is real session/config isolation.

For users, that means a stronger notion of:

- separate personas
- separate provider credentials
- separate configs and service names
- separate data stores

## 4. Messaging gateway UX is very strong

`gateway/run.py`, `gateway/session.py`, `gateway/platforms/base.py`, and `gateway/delivery.py` show a serious messaging-product architecture.

Hermes supports:

- many messaging platforms
- unified `MessageEvent` abstraction
- media caching for images/audio/documents
- per-session interrupt handling
- thread/session routing rules
- platform-specific delivery adapters
- typing indicators
- native media send methods
- approval flows in-band
- home-channel and origin routing for automation outputs

This is one of the strongest messaging UX implementations among the explored harnesses.

## 5. Session routing is nuanced and configurable

`gateway/session.py` reveals a thoughtful routing model:

- DM sessions
- group/channel sessions
- thread-aware sessions
- optional group isolation per user
- optional thread sharing vs per-user thread isolation
- platform-sensitive reset policies
- auto-reset notices

That gives Hermes a realistic message-continuity model.

### Session key model

```text
source message
  -> platform + chat_type + chat_id + thread_id + maybe user_id
  -> deterministic session_key
  -> current session entry
  -> reset policy evaluation
  -> transcript + SQLite persistence
```

This is stronger than simpler "one chat = one transcript" systems.

## 6. Gateway can keep working even when no chat adapter is connected

From `gateway/run.py`, Hermes can continue running for cron execution even if no messaging platform is currently connected.

That is a useful UX distinction.

It frames the gateway as an automation host, not only a chat relay.

## 7. Service installation and lifecycle UX are unusually complete

`hermes_cli/gateway.py` includes serious service-management support for:

- systemd user services
- systemd system services
- launchd
- process sweeps and replace logic
- service definition regeneration
- per-profile service naming
- linger guidance for Linux user services

This is a large UX investment in operability.

Many projects leave this to docs; Hermes bakes it into CLI behavior.

## 8. API server extends UX into ecosystem compatibility

`gateway/platforms/api_server.py` is one of the more interesting files.

Hermes can present itself as an OpenAI-compatible server with endpoints such as:

- `/v1/chat/completions`
- `/v1/responses`
- `/v1/models`
- `/v1/runs`
- response retrieval and delete endpoints
- health checks

That means frontends like Open WebUI, LobeChat, LibreChat, etc. can use Hermes as a back-end agent runtime.

This is a major UX bridge feature.

## 9. MCP server is another ecosystem bridge

`mcp_serve.py` exposes conversation and messaging surfaces as MCP tools.

It includes tools like:

- conversation listing
- message reading
- event polling/waiting
- message sending
- approval inspection/responding
- channel listing

This is a smart bridge between Hermes's gateway world and coding-agent/MCP ecosystems.

## 10. UX strengths

- one of the broadest user-surface portfolios in the set
- strong messaging UX with real session routing and media handling
- excellent service/deployment ergonomics for a self-hosted agent
- profile-aware UX supports multiple personas/environments
- API server and MCP server make Hermes easy to integrate into other UX shells
- cron and delivery routing broaden the system beyond chat

## 11. UX weaknesses

- complexity is very high for new users
- many UX pathways depend on significant configuration
- broad support means discoverability can suffer
- messaging, CLI, API, MCP, and service behaviors all intersect, which raises edge-case complexity

## DX: Developer Experience

## 1. Registry-driven tools are a real architectural strength

`model_tools.py` and the registry-backed design are solid.

Hermes has:

- self-registering tool modules
- plugin tool injection
- MCP tool discovery
- availability checks
- toolset-aware filtering
- schema generation for model calls

This is good extensibility architecture.

## 2. Toolsets are a valuable developer-facing abstraction

The toolset system is a strong DX choice because it creates a middle layer between:

- raw tools
- full runtime surfaces

Developers can reason in terms of:

- `hermes-cli`
- `hermes-api-server`
- `hermes-telegram`
- `browser`
- `file`
- `delegation`
- etc.

That is more maintainable than hardcoding platform-specific tool lists everywhere.

## 3. Plugin system is broad but more pragmatic than deeply sandboxed

`hermes_cli/plugins.py` supports:

- user plugins
- project plugins
- pip entry-point plugins
- tool registration
- hook registration
- CLI command registration
- message injection into active conversations

That is a powerful extension surface.

Notable valid hooks include:

- pre/post tool call
- pre/post LLM call
- pre/post API request
- session lifecycle hooks

This is a solid developer extension story.

## 4. Runtime provider resolution is thoughtfully centralized

`hermes_cli/runtime_provider.py` is one of the better-factored parts of the repo.

It centralizes provider resolution across:

- CLI
- gateway
- cron
- helpers

It handles:

- config/env/provider selection
- credential pools
- custom providers
- API mode detection
- OpenAI/Codex/Anthropic/OpenRouter differences
- provider-specific runtime credentials

This is strong DX because provider logic is usually a source of duplication and drift.

## 5. SessionDB is a strong infrastructure layer

`hermes_state.py` is good engineering in several ways:

- explicit schema versioning
- WAL mode
- FTS5
- retry/jitter around write contention
- session lineage
- title management
- export/search/list utilities

This is one of Hermes's better-bounded modules and gives the rest of the system a strong persistence substrate.

## 6. Gateway/base adapter abstraction is useful and realistic

`gateway/platforms/base.py` provides a real adapter contract for messaging platforms.

It includes:

- connection lifecycle
- send/edit/typing/media hooks
- normalized inbound `MessageEvent`
- retry classification
- approval/interrupt-aware session handling
- local cache helpers for images/audio/documents

That is strong DX for adding new platforms.

## 7. But the repo suffers badly from orchestration concentration

Hermes has multiple huge files acting as subsystem roots.

That hurts DX because:

- onboarding requires reading massive orchestrators
- refactoring cost is high
- feature interactions are likely hard to test exhaustively
- the architecture is broader than the modularity level suggests

This is the single biggest DX problem in the repo.

## 8. The repo mixes platform, product, and runtime concerns very tightly

For example:

- gateway code knows a lot about provider/runtime creation
- the agent runtime knows a lot about persistence, memory, prompting, and provider failover
- the CLI manages setup, service install, provider flows, and execution mode routing

This tight integration is efficient product engineering, but it reduces seam clarity.

## 9. DX strengths

- strong tool registry and toolset abstractions
- useful plugin model with hooks, tools, and CLI command registration
- centralized runtime provider resolution is well-designed
- SessionDB is a strong persistence/search foundation
- gateway adapter base is practical and well-scoped for platform additions
- MCP and API server surfaces make integration easier

## 10. DX weaknesses

- extreme large-file concentration
- many concerns are integrated into a few giant subsystem roots
- agent runtime is harder to decompose mentally than Pi/OpenCode
- broad feature set increases coupling across CLI, gateway, runtime, and state layers
- extension stability may be harder to guarantee because so much behavior is centralized

## Context Window and Tool-Calling Diagrams

## Main agent path

```text
user input / gateway event / API request
  -> construct AIAgent
  -> load provider runtime + tool definitions
  -> build system + memory + skills + platform context
  -> run tool-calling conversation loop
  -> maybe delegate / maybe execute code / maybe use memory tools
  -> persist transcript + session data
  -> route result back to CLI/gateway/API client
```

## Tool system

```text
tool modules / plugins / MCP discovery
  -> registry
  -> toolset resolution
  -> platform/runtime filtering
  -> model-visible schemas
  -> dispatch through handle_function_call / agent loop
```

## Gateway path

```text
platform adapter event
  -> normalized MessageEvent
  -> session key resolution
  -> running-session interrupt/queue logic
  -> gateway handler creates or reuses AIAgent context
  -> transcript/session DB update
  -> delivery router sends result back to origin/home/local target
```

## Comparison Notes vs Prior Harnesses

### Compared to Pi

- Hermes is much broader and much more productized around personal-agent deployment
- Pi has cleaner architecture and smaller core abstractions
- Hermes is stronger on messaging, service management, memory workflows, and multi-surface deployment
- Pi is easier to reason about as a harness toolkit

### Compared to OpenCode

- OpenCode is a cleaner coding-platform runtime
- Hermes is broader as a personal-agent platform with messaging and automation
- Hermes has stronger memory/session-search/product-shell behavior
- OpenCode is easier to reason about as a coding harness specifically

### Compared to Codebuff

- Codebuff is more explicitly orchestration-first for coding specialists
- Hermes is more general-purpose and personal-assistant oriented
- Hermes bakes code execution and delegation into one integrated runtime instead of building the product around agent specialists

### Compared to OpenClaw

- Hermes and OpenClaw are the closest in overall ambition
- OpenClaw is more gateway/control-plane/platform oriented
- Hermes is more agent-runtime-centric even though its gateway is large
- Hermes feels more like a personal agent with many surfaces; OpenClaw feels more like a generalized assistant platform/gateway that embeds agent execution
- Hermes's session DB + memory + toolset stack is more prominent in the architecture than OpenClaw's plugin/gateway substrate

### Compared to Claude Code

- Claude Code is more focused on coding-agent execution quality, transport-aware sessions, and prompt/cache engineering
- Hermes is much broader as a personal-agent platform with memory, gateway, automation, and profile/service management
- Claude Code has a more sophisticated coding-turn kernel
- Hermes has broader deployment and messaging breadth, but less cleanliness in execution-core structure

## Preliminary Non-Scored Assessment

### AX

Hermes has a strong, feature-rich agent runtime with real memory, delegation, programmatic tool use, and bounded autonomy. Its weakness is concentration: too much core logic lives inside one huge runtime object.

### UX

Hermes is one of the most complete self-hosted personal-agent products in the set. Messaging, service deployment, profiles, automation, API compatibility, and MCP bridging all materially improve the user surface.

### DX

There are real architectural strengths — especially around tools, toolsets, plugins, provider routing, and session storage — but the giant subsystem files impose serious complexity costs.

## Final Takeaways

Hermes Agent is an ambitious integrated personal-agent system built around:

- one massive central runtime (`AIAgent`)
- one massive gateway runtime
- one massive CLI/product shell
- a solid registry-based tool and toolset layer
- persistent session/memory/search infrastructure
- many deployment and integration surfaces

Its strongest engineering traits are:

- broad tool and platform capability coverage
- serious messaging gateway support
- strong session persistence and FTS-backed recall
- built-in memory workflows and pre-reset preservation logic
- practical service/deployment engineering
- registry-based tools, plugin hooks, and provider routing

Its biggest tradeoff is concentration:

- multiple critical files are extremely large
- execution logic is less cleanly separated than in some peers
- understanding the system requires holding several huge product subsystems in your head at once

Hermes is therefore best understood not as a minimal harness, and not as only a coding assistant, but as a **self-hosted personal-agent operating environment** with a very powerful but highly centralized runtime core.
