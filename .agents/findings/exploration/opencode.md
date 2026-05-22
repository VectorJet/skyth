# OpenCode Exploration

## Scope

This document explores `refs/opencode` as an engineered harness, focusing on:

- AX — Agent experience
- UX — User experience
- DX — Developer experience

This is an exploration, not a ranking.

## What OpenCode Is

OpenCode is a large Bun/TypeScript monorepo, but the core harness lives in:

- `refs/opencode/packages/opencode`

Unlike Pi, which is split into a cleaner package stack (`ai` / `agent` / `coding-agent`), OpenCode keeps most core runtime concerns inside one large product package and then exposes multiple clients around it:

- terminal CLI / TUI
- headless server
- desktop client(s)
- web/app clients
- ACP server
- SDK

At the code level, OpenCode is best understood as a **client/server agent platform with evented session state**, not just a terminal assistant.

## High-Level Architecture

```text
clients
├─ terminal CLI / TUI
├─ desktop
├─ web/app
├─ ACP stdio server
└─ remote attached CLI
       |
       v
packages/opencode/src/server
├─ Hono control-plane API
├─ event routes / websocket / SSE style streams
├─ workspace router
└─ instance routes
       |
       v
instance/project context
├─ config
├─ provider registry
├─ agent registry
├─ tool registry
├─ plugin system
├─ skill system
├─ MCP / LSP / shell / filesystem
└─ session engine
       |
       v
session runtime
├─ SessionPrompt
├─ SessionProcessor
├─ SessionCompaction
├─ Session store + sync events
└─ permission engine
       |
       v
providers / models
```

## Key Files Read

Primary code paths used in this exploration:

- `refs/opencode/README.md`
- `refs/opencode/package.json`
- `refs/opencode/packages/opencode/package.json`
- `refs/opencode/packages/opencode/src/index.ts`
- `refs/opencode/packages/opencode/src/cli/bootstrap.ts`
- `refs/opencode/packages/opencode/src/cli/cmd/run.ts`
- `refs/opencode/packages/opencode/src/cli/cmd/serve.ts`
- `refs/opencode/packages/opencode/src/agent/agent.ts`
- `refs/opencode/packages/opencode/src/session/index.ts`
- `refs/opencode/packages/opencode/src/session/prompt.ts`
- `refs/opencode/packages/opencode/src/session/processor.ts`
- `refs/opencode/packages/opencode/src/session/compaction.ts`
- `refs/opencode/packages/opencode/src/session/system.ts`
- `refs/opencode/packages/opencode/src/tool/registry.ts`
- `refs/opencode/packages/opencode/src/tool/task.ts`
- `refs/opencode/packages/opencode/src/permission/index.ts`
- `refs/opencode/packages/opencode/src/permission/evaluate.ts`
- `refs/opencode/packages/opencode/src/plugin/index.ts`
- `refs/opencode/packages/opencode/src/plugin/loader.ts`
- `refs/opencode/packages/opencode/src/config/config.ts`
- `refs/opencode/packages/opencode/src/skill/index.ts`
- `refs/opencode/packages/opencode/src/skill/discovery.ts`
- `refs/opencode/packages/opencode/src/provider/provider.ts`
- `refs/opencode/packages/opencode/src/server/server.ts`
- `refs/opencode/packages/opencode/src/server/router.ts`
- `refs/opencode/packages/opencode/src/acp/README.md`
- `refs/opencode/packages/opencode/src/cli/cmd/acp.ts`

## Architectural Character

OpenCode is much more product-heavy than Pi.

It bakes a lot of workflow concepts directly into core:

- built-in primary agents (`build`, `plan`)
- built-in subagents (`general`, `explore`, plus user-defined)
- built-in task delegation tool
- built-in todo tool
- built-in permission asking
- built-in compaction and pruning
- built-in client/server transport
- built-in MCP and LSP integration
- built-in ACP server

Compared to Pi, this is less of a minimal kernel and more of a large integrated harness platform.

## AX: Agent Experience

## 1. Built-in agent model is first-class

`src/agent/agent.ts` defines several native agents directly:

- `build` — default full-access primary agent
- `plan` — read-mostly planning agent with constrained edit permissions
- `general` — subagent for general parallel work
- `explore` — subagent specialized for codebase search/exploration
- hidden internal agents for `compaction`, `title`, and `summary`

This is a major design difference from Pi.

OpenCode does not merely allow agents; it **ships workflow-specific agents as core product concepts**.

### Agent permissions are part of the agent identity

The agent registry merges:

- global defaults
- user config permissions
- agent-specific permission overlays

So an agent is not just a prompt. It is:

- prompt
- model override
- variant override
- temperature/top-p
- mode (`primary`, `subagent`, `all`)
- color/visibility metadata
- permission ruleset
- optional step limits

That is a strong harness design for agent specialization.

## 2. The system prompt is provider-aware and environment-aware

`src/session/system.ts` builds prompt components from:

- provider/model-specific system prompt templates
- environment block with cwd, workspace root, repo status, platform, date
- optional skill catalog text

Prompt selection is model-family-specific:

- Anthropic prompt
- GPT prompt
- Gemini prompt
- Codex prompt
- Trinity/Kimi variants
- fallback default prompt

This means OpenCode treats prompt engineering as provider-adaptive runtime behavior, not a single static system prompt.

### Prompt structure

```text
system prompt
├─ provider/model-family prompt template
├─ environment description
│  ├─ working directory
│  ├─ workspace root
│  ├─ git repo status
│  ├─ platform
│  └─ date
├─ skill availability block
├─ optional agent prompt override
├─ instruction prompt additions
└─ plugin prompt transforms
```

## 3. SessionPrompt is the real harness core

`src/session/prompt.ts` is the center of the runtime.

It owns:

- busy/idle runner management per session
- prompt resolution
- command execution
- shell execution
- title generation
- plan/build reminders
- tool resolution
- MCP tool binding
- subtask handling
- file attachment normalization
- user message creation
- model resolution

This is the most important implementation file in the harness and it is very large: about 1912 lines.

That size is a maintainability problem, but it also shows where OpenCode's real orchestration logic lives.

## 4. The message model is richly structured

OpenCode's session message system is not just `user -> assistant -> tool result` text.

From `Session`, `SessionProcessor`, and `MessageV2` usage, a message can accumulate many part types:

- text
- reasoning
- tool
- step-start
- step-finish
- patch
- compaction
- file/media parts
- subtask parts

This is a strong harness trait because the runtime persists process state, not only transcript text.

### Runtime event flow

```text
user prompt
  -> SessionPrompt creates user message + parts
  -> assistant message allocated
  -> SessionProcessor streams model events
       ├─ reasoning-start/delta/end
       ├─ text-start/delta/end
       ├─ tool-input-start
       ├─ tool-call
       ├─ tool-result/tool-error
       ├─ step-start/finish
       └─ finish/error
  -> session state updated incrementally
  -> bus events emitted for clients
```

This is a more eventful and inspectable runtime than simpler single-loop harnesses.

## 5. Tool model is broad and integrated

`ToolRegistry` assembles built-ins plus plugin tools and directory-scanned tools.

Built-ins include:

- `bash`
- `read`
- `glob`
- `grep`
- `edit`
- `write`
- `task`
- `webfetch`
- `todowrite`
- `websearch`
- `codesearch`
- `skill`
- `apply_patch`
- optional `lsp`
- optional `batch`
- optional `plan_exit`

Tool exposure also depends on model/provider.

Example:

- some GPT-family models use `apply_patch` instead of `edit`/`write`
- search tools depend on the opencode provider or EXA enablement

This is a very product-tuned tool registry.

## 6. Subagents are real, not a future abstraction

`TaskTool` creates child sessions and dispatches work to subagents.

Important details:

- subagents are filtered by permission
- child sessions inherit bounded permission overlays
- task sessions can be resumed with `task_id`
- task execution returns structured output and records metadata
- the parent agent can launch specialized agents as tools

### Subagent execution shape

```text
assistant calls task tool
  -> validate requested subagent type
  -> create or resume child session
  -> resolve prompt parts
  -> run SessionPrompt.prompt() in child session
  -> capture child output
  -> return task_id + result summary to parent session
```

This is one of OpenCode's biggest AX advantages.

## 7. Plan mode is deeply built in

OpenCode's `plan` mode is not just a different prompt.

The runtime injects reminders and restrictions that enforce a workflow:

- only plan-file edits are allowed
- non-read-only actions are blocked
- user clarification is encouraged early
- exploration subagents are explicitly recommended
- final turn should end in `question` or `plan_exit`

This is very opinionated and clearly productized.

Compared with Pi, where such patterns are extension territory, OpenCode makes plan mode a native behavior.

## 8. Permission engine is core to tool execution

`Permission.ask()` evaluates a request against:

- agent rules
- session rules
- project-approved persisted rules

Rule evaluation is simple but effective:

- wildcard permission match
- wildcard pattern match
- last matching rule wins
- default action is `ask`

This is good harness engineering because safety checks are centralized rather than scattered across tools.

### Permission flow

```text
tool wants action
  -> Permission.evaluate(permission, pattern, rulesets...)
       -> allow => continue
       -> deny => throw denied error
       -> ask => publish permission.asked event and wait
  -> user/client replies once | always | reject
  -> pending matching requests may be auto-resolved
```

## 9. Doom-loop protection exists in the processor

`SessionProcessor` watches for repeated identical tool calls.

If the same tool with the same input repeats enough times, it asks for `doom_loop` permission.

That is a smart built-in safeguard against runaway loops and is stronger than many simpler harnesses.

## 10. Compaction is first-class and multi-stage

`SessionCompaction` supports:

- overflow detection
- history summarization with a dedicated hidden `compaction` agent
- optional auto-continue after compaction
- replay of latest relevant user content after summarization
- pruning of older large tool outputs before full compaction

This is one of the richer compaction implementations seen so far.

### Compaction pipeline

```text
session grows
  -> overflow/pruning checks
  -> prune old completed tool outputs when possible
  -> if still too large, create compaction marker
  -> hidden compaction agent summarizes session
  -> optionally replay latest user message/context
  -> continue run or stop with overflow error
```

OpenCode's compaction is more workflow-aware than a naive summarize-and-trim approach.

## 11. AX strengths

- built-in agent taxonomy is strong and practical
- task delegation is real and session-based
- planning workflow is encoded into runtime behavior
- permission system is central and coherent
- message/part model is rich and eventful
- compaction and pruning are sophisticated
- tool registry is broad and model-aware
- MCP and LSP are integrated into the same harness surface

## 12. AX weaknesses

- orchestration is concentrated in a few very large files
- many features are highly intertwined, which raises cognitive load
- agent behavior is product-opinionated, reducing minimality
- the runtime surface is powerful but harder to reason about end-to-end than Pi's layered split

## UX: User Experience

## 1. OpenCode is explicitly multi-client

The README claim about client/server architecture is real in code.

Users can interact through:

- local CLI/TUI
- `opencode serve` headless server
- remote attached CLI via `--attach`
- desktop/web clients through the same control plane
- ACP-compatible clients

This is one of OpenCode's defining UX properties.

## 2. `run` command is a usable non-interactive surface

`src/cli/cmd/run.ts` gives a strong scripting UX:

- continue last session or specific session
- fork existing sessions
- share sessions
- attach files
- choose model / agent / variant
- choose JSON event output
- attach to remote server
- print tool activity in human-readable form

This is stronger than many CLIs that only support interactive mode well.

## 3. Session UX is serious

From `Session` and CLI flags, users get:

- explicit session IDs
- root/child sessions
- forked sessions
- titles
- sharing/unsharing
- archived sessions
- revert metadata
- diff summaries

OpenCode treats sessions as long-lived structured work objects, not disposable transcripts.

## 4. Plan/build UX is user-visible and meaningful

The README exposes `build` and `plan` as first-class modes. This is backed by code.

For users, that means the harness supports two distinct defaults:

- act and change code
- inspect and plan conservatively

This is a clean UX abstraction because it packages safety and intent together.

## 5. Permission UX is consistent across clients

Because permissions emit bus events from core, different clients can present them in their own way while preserving the same runtime policy.

That is a major advantage of OpenCode's client/server split.

## 6. Remote and workspace UX

The server router can route requests by:

- current local directory
- specified workspace
- forwarded remote workspace adaptor

This suggests a UX model where the same front-end can operate across:

- local projects
- worktree workspaces
- remote workspace adaptors

That is more ambitious than a local-only CLI harness.

## 7. ACP UX broadens ecosystem fit

OpenCode's ACP implementation lets external ACP clients speak to it over stdio while still using the internal session runtime.

That matters for editor integration and protocol interoperability.

## 8. UX strengths

- strong multi-client story grounded in real server code
- good non-interactive CLI surface
- explicit plan/build modes are easy for users to reason about
- sessions are durable, forkable, and shareable
- remote attach and workspace routing are practical differentiators
- ACP support broadens integration options

## 9. UX weaknesses

- product complexity is high; there are many modes and concepts
- some behavior is hidden in runtime policy rather than obvious at first glance
- permission UX depends on the quality of the current client implementation
- because so much is built in, the mental model is heavier than a minimal coding harness

## DX: Developer Experience

## 1. Plugin system is substantial

`Plugin` and `PluginLoader` support:

- internal built-in plugins
- external plugins from config
- npm/path plugin resolution
- compatibility checking
- deterministic sequential hook registration
- server-side hook execution
- plugin-triggered tool and text transforms
- event subscriptions via the bus

This is a strong extensibility story, even though the implementation is more product-specific than Pi's extension API.

## 2. Config system is broad and discovery-heavy

`config.ts` is very large and supports loading/merging from multiple places, including:

- managed config dirs
- user config
- project config
- markdown-defined agents and commands
- plugin specs
- instruction files
- dependency installation for config directories

This is powerful but very complex.

The code shows OpenCode wants config directories to behave almost like installable programmable overlays.

## 3. Skills are a real subsystem

The `Skill` service supports discovery from:

- external directories like `.claude` and `.agents`
- ancestor project directories
- opencode config directories
- explicit local paths
- remote skill indexes fetched over HTTP

This is broader than many harnesses and resembles a distributed skill ecosystem rather than a local-only folder loader.

## 4. Provider layer is broad

`provider.ts` is massive and supports many provider backends directly:

- Anthropic
- OpenAI
- Google / Vertex
- Bedrock
- Azure
- OpenRouter
- xAI
- Mistral
- Groq
- DeepInfra
- Cohere
- TogetherAI
- Perplexity
- Vercel
- GitLab
- GitHub Copilot
- OpenCode-hosted models

This is very capable, but it also means the provider layer is one of the biggest complexity centers in the repo.

## 5. Event-driven state makes external clients possible

The combination of:

- session sync events
- bus events
- server routes
- workspace router

creates a strong foundation for alternate frontends.

This is one of OpenCode's most important DX traits: developers can build clients against a live runtime, not just embed a library.

## 6. ACP support is a DX multiplier

Because OpenCode also speaks ACP, it can participate in ecosystems that expect a standard agent protocol, without abandoning its own internal control plane.

That is a meaningful developer ergonomics win.

## 7. DX strengths

- powerful built-in plugin/hook architecture
- deep config-driven extensibility
- strong protocol and transport story via server + ACP
- broad provider support
- rich structured session model for custom clients/tools
- skills, commands, agents, and tools can all be discovered or configured

## 8. DX weaknesses

- several critical files are too large:
  - `session/prompt.ts` ~1912 lines
  - `provider/provider.ts` ~1609 lines
  - `config/config.ts` ~1580 lines
  - `session/index.ts` ~892 lines
  - `session/processor.ts` ~519 lines
  - `session/compaction.ts` ~427 lines
- boundaries are less clean than Pi's package decomposition
- the effect-based service architecture is powerful but raises onboarding cost
- product logic, transport, and runtime concerns often meet inside the same package

## Context Window and Tool Calling Diagrams

## Context assembly

```text
session input
├─ user message parts
│  ├─ text
│  ├─ files
│  ├─ data URLs
│  ├─ MCP resources
│  └─ resolved prompt parts / command references
├─ reminders
│  ├─ plan-mode reminder
│  ├─ build-switch reminder
│  └─ max-step / workflow reminders
├─ system prompt pieces
│  ├─ provider template
│  ├─ environment block
│  ├─ skill list
│  └─ plugin transforms
└─ historical messages / compaction summaries
```

## Tool execution path

```text
LLM emits tool call
  -> SessionProcessor records pending/running tool part
  -> SessionPrompt.resolveTools() provides executable tool map
  -> tool context created with
       - sessionID
       - messageID
       - abort signal
       - metadata updater
       - permission asker
       - agent info
       - message history
  -> plugin hook: tool.execute.before
  -> tool runs
  -> plugin hook: tool.execute.after
  -> SessionProcessor records completed/error tool part
  -> events broadcast to clients
```

## Client/server path

```text
CLI / desktop / web / ACP client
  -> Hono server routes
  -> workspace router
       ├─ local instance route
       └─ remote workspace adaptor
  -> session runtime services
  -> bus/sync events
  -> streamed state back to client
```

## Comparison Notes vs Pi and OpenHarness

### Compared to Pi

- OpenCode is more batteries-included and opinionated
- Pi is cleaner as a reusable package stack
- OpenCode ships planning, permission, todo, subagents, and workflow policy in core
- Pi is easier to describe as a minimal harness kernel; OpenCode is easier to describe as a full harness product platform

### Compared to OpenHarness

- both are more productized than Pi
- OpenCode appears stronger on client/server architecture and session event modeling
- OpenHarness emphasizes orchestration/governance; OpenCode emphasizes integrated operational workflows and multi-client delivery
- OpenCode's built-in plan/build/subagent design is especially explicit and code-backed

## Preliminary Non-Scored Assessment

### AX

OpenCode has one of the richest built-in agent experiences so far.

Its biggest strengths are:

- native specialized agents
- true subagent delegation
- strong structured session parts
- central permission engine
- rich compaction pipeline
- multi-surface event streaming

Its main cost is complexity concentration in a few huge orchestration files.

### UX

OpenCode is strongest when seen as a multi-client coding agent platform rather than a simple terminal tool. The server, attach flow, workspace routing, sharing, ACP support, and plan/build separation give it a very capable user surface.

### DX

DX is powerful but heavy. There is a lot to extend and integrate with, but the runtime is not as cleanly decomposed as Pi. Developers get a lot of leverage in exchange for more complexity and larger files.

## Final Takeaways

OpenCode is engineered around a different philosophy than Pi.

Pi says:

- keep core small
- let extensions build the rest

OpenCode says:

- ship the important coding-agent workflows in core
- expose them over a server/control plane
- let multiple clients and plugins participate in the same runtime

At the code level, OpenCode is:

- highly capable
- strongly evented
- richly stateful
- deeply integrated
- more opinionated than the harnesses explored so far

Its biggest engineering advantages are:

- built-in workflow agents and delegation
- client/server architecture with workspace routing
- structured session/event model
- central permission and compaction systems
- strong extensibility through plugins, skills, tools, and config

Its biggest engineering drawback is code concentration: several of the most important files are already well past the repo's preferred size threshold.