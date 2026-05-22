# OpenHarness Exploration

## Scope

This document explores `refs/OpenHarness` as an agent harness at the code level, focusing on:

1. AX — Agent experience
2. UX — User experience
3. DX — Developer experience

This is an exploration, not a ranking.

## What OpenHarness Is

OpenHarness is a Python harness that positions itself as an open, Claude-Code-style agent runtime with:

- a conversation engine
- a typed tool registry
- provider workflows and profiles
- permission gating
- lifecycle hooks
- plugin and skill loading
- auto-compaction
- background tasks
- multi-agent swarm/coordinator features
- multiple UIs, including a React terminal frontend
- a personal-agent layer called `ohmo`

At a code level, the main implementation lives under:

- `refs/OpenHarness/src/openharness/`
- personal-agent app in `refs/OpenHarness/ohmo/`
- React terminal frontend in `refs/OpenHarness/frontend/terminal/`

## High-Level Architecture

```text
User
  |
  +-- `oh` CLI / Textual UI / React terminal UI
  +-- `ohmo` personal-agent app
  +-- background bridge sessions
  +-- channel gateways via ohmo
          |
          v
     RuntimeBundle
          |
          +-- Settings / provider profile resolution
          +-- API client selection
          +-- Tool registry
          +-- Permission checker
          +-- Hook executor
          +-- QueryEngine
          +-- Session backend
          +-- MCP manager
          +-- App state store
          |
          v
       QueryEngine
          |
          v
        run_query()
          |
          +-- model streaming
          +-- tool execution
          +-- permission checks
          +-- hooks
          +-- auto-compaction
          +-- retries
          |
          v
       ToolRegistry / tasks / swarm / plugins / skills / memory
```

## Core Files Read

Key files reviewed for this exploration:

- `refs/OpenHarness/src/openharness/cli.py`
- `refs/OpenHarness/src/openharness/ui/runtime.py`
- `refs/OpenHarness/src/openharness/ui/backend_host.py`
- `refs/OpenHarness/src/openharness/ui/protocol.py`
- `refs/OpenHarness/src/openharness/engine/query_engine.py`
- `refs/OpenHarness/src/openharness/engine/query.py`
- `refs/OpenHarness/src/openharness/engine/messages.py`
- `refs/OpenHarness/src/openharness/prompts/system_prompt.py`
- `refs/OpenHarness/src/openharness/prompts/context.py`
- `refs/OpenHarness/src/openharness/prompts/claudemd.py`
- `refs/OpenHarness/src/openharness/tools/base.py`
- `refs/OpenHarness/src/openharness/tools/__init__.py`
- `refs/OpenHarness/src/openharness/permissions/checker.py`
- `refs/OpenHarness/src/openharness/config/settings.py`
- `refs/OpenHarness/src/openharness/config/schema.py`
- `refs/OpenHarness/src/openharness/api/client.py`
- `refs/OpenHarness/src/openharness/api/openai_client.py`
- `refs/OpenHarness/src/openharness/api/registry.py`
- `refs/OpenHarness/src/openharness/plugins/loader.py`
- `refs/OpenHarness/src/openharness/skills/loader.py`
- `refs/OpenHarness/src/openharness/services/compact/__init__.py`
- `refs/OpenHarness/src/openharness/services/session_storage.py`
- `refs/OpenHarness/src/openharness/tasks/manager.py`
- `refs/OpenHarness/src/openharness/hooks/executor.py`
- `refs/OpenHarness/src/openharness/coordinator/coordinator_mode.py`
- `refs/OpenHarness/src/openharness/swarm/team_lifecycle.py`
- `refs/OpenHarness/src/openharness/channels/impl/base.py`
- `refs/OpenHarness/src/openharness/channels/impl/manager.py`
- `refs/OpenHarness/src/openharness/bridge/manager.py`
- `refs/OpenHarness/ohmo/cli.py`
- `refs/OpenHarness/README.md`
- `refs/OpenHarness/pyproject.toml`

## Architectural Character

OpenHarness is much more explicitly a harness framework than Nanobot.

Its code organization reflects that. It has named subsystems for:

- engine
- prompts
- permissions
- hooks
- plugins
- skills
- memory
- tasks
- coordinator/swarm
- MCP
- UI protocol and backend host
- channels and personal-agent gateway (`ohmo`)

It is not minimal. It is trying to be a general harness platform.

## AX: Agent Experience

## 1. What the agent actually sees

The runtime system prompt is assembled by `build_runtime_system_prompt()` in `refs/OpenHarness/src/openharness/prompts/context.py`.

The effective prompt can contain:

- the built-in base system prompt from `system_prompt.py`
- environment facts:
  - OS
  - architecture
  - shell
  - working directory
  - date
  - Python runtime
  - git branch info
- fast mode instructions
- reasoning settings (`effort`, `passes`)
- available skills list
- discovered `CLAUDE.md` and `.claude/rules/*.md`
- issue and PR comment context files if present
- memory prompt and relevant memory files

This is a notably rich context stack.

### Prompt composition diagram

```text
system prompt
├─ built-in OpenHarness instructions
├─ environment section
│  ├─ OS / shell / cwd / date / python
│  └─ git repo / branch if present
├─ fast-mode section if enabled
├─ reasoning settings
│  ├─ effort
│  └─ passes
├─ available skills section
├─ project instructions
│  ├─ CLAUDE.md
│  ├─ .claude/CLAUDE.md
│  └─ .claude/rules/*.md
├─ issue / PR context files
├─ memory prompt
└─ relevant memory file excerpts

conversation history
├─ user messages
├─ assistant text/tool_use messages
└─ tool_result user messages

current turn
└─ new user prompt appended by QueryEngine
```

Compared with Nanobot, OpenHarness leans harder into Claude-style project instruction discovery. `CLAUDE.md` is a first-class source of agent context through `prompts/claudemd.py`.

## 2. Message representation

The message model in `engine/messages.py` is explicit and typed.

Blocks include:

- `TextBlock`
- `ImageBlock`
- `ToolUseBlock`
- `ToolResultBlock`

A `ConversationMessage` is only:

- `role="user"`
- `role="assistant"`
- `content: list[ContentBlock]`

This is a strong AX design because the harness keeps an internal canonical conversation model rather than letting every provider dictate message structure.

### Tool-use loop shape

```text
assistant message
├─ text blocks
└─ tool_use blocks

user message
├─ text blocks
└─ tool_result blocks
```

That is very close to Anthropic's native structure, and OpenHarness then adapts this model to other provider APIs when needed.

## 3. How tool calling actually works

The high-level loop is in `run_query()` in `refs/OpenHarness/src/openharness/engine/query.py`, wrapped by `QueryEngine` in `query_engine.py`.

`QueryEngine.submit_message()`:

- appends the user message
- creates a `QueryContext`
- runs `run_query()`
- yields stream events while tracking usage

The loop coordinates:

- API streaming
- tool execution
- permission checks
- hook execution
- compaction
- retries

This is a more explicit harness loop than Nanobot's simpler agent loop.

### Query loop diagram

```text
submit user message
  -> stream model response
  -> emit assistant deltas
  -> if tool_use blocks present
       for each tool call
         -> permission check
         -> optional approval prompt
         -> run hooks
         -> execute tool
         -> run post hooks
         -> append tool_result blocks
       -> continue model loop
  -> else finish assistant turn
```

## 4. Tool abstraction

Tools are defined via `BaseTool` in `tools/base.py`.

Each tool has:

- `name`
- `description`
- `input_model` as a Pydantic model
- `execute(arguments, context) -> ToolResult`
- `is_read_only(arguments)`

Unlike Nanobot's JSON-schema-first base class, OpenHarness centers tools on Pydantic input models and derives JSON schema from them.

This is good AX because:

- model-visible tool schemas are generated automatically
- validation is typed and structured
- tools can report both output and metadata through `ToolResult`

## 5. Tool surface available to the agent

Built-ins are registered in `tools/__init__.py`.

The default registry includes a large tool surface, such as:

- `bash`
- `file_read`, `file_write`, `file_edit`
- `glob`, `grep`
- `notebook_edit`
- `lsp`
- `skill`
- `tool_search`
- `web_fetch`, `web_search`
- `config`, `brief`, `sleep`
- plan mode / worktree tools
- cron tools
- task tools
- `agent`, `send_message`
- team tools
- MCP resources and server tools

This is broader than Nanobot's default surface and clearly designed to support complex workflows.

## 6. Permission gating in the agent loop

Permission evaluation happens in `permissions/checker.py`.

The checker considers:

- built-in sensitive path deny rules
- explicit denied tools
- explicit allowed tools
- path rules
- denied command patterns
- global permission mode

Modes include:

- default
- plan mode
- full auto

Decision outcomes are explicit:

- allow immediately
- deny
- require confirmation

This is one of the strongest AX differences versus Nanobot. OpenHarness makes permissions part of the loop contract, not just best-effort tool safety.

### Permission flow

```text
tool call requested
  -> PermissionChecker.evaluate(...)
      -> allowed
      -> denied
      -> requires_confirmation
            -> ask UI/user
            -> continue or reject
```

## 7. Hooks inside the loop

Hook execution is first-class through `hooks/executor.py`.

Supported hook types include:

- command hooks
- HTTP hooks
- prompt hooks
- agent hooks

The hook engine can:

- run shell commands
- call HTTP endpoints
- query an LLM to validate or inspect an event
- block execution on failure

This is a major harness feature. It means the agent experience is not just model plus tools, but model plus tools plus programmable lifecycle interception.

## 8. Auto-compaction and context-window engineering

One of OpenHarness's most interesting AX features is `services/compact/__init__.py`.

The design includes:

- token estimation
- auto-compact thresholds
- microcompact for clearing old tool results cheaply
- full LLM-based summarization of older messages
- reactive compaction on prompt-too-long errors
- progress events during compaction
- carryover metadata for preserving tool state context

This is clearly more sophisticated than a simple truncate-history approach.

### Context-window management diagram

```text
conversation grows
  -> estimate tokens
  -> if near threshold
       -> microcompact old tool outputs
       -> if still too large
            -> full compact older messages into summary
            -> preserve recent messages
            -> preserve carryover metadata
  -> continue query loop
```

The base system prompt even tells the agent:

- "The system will automatically compress prior messages as it approaches context limits."
- "Your conversation is not limited by the context window."

That is a powerful agent affordance if the compaction system is reliable.

## 9. Provider adaptation

OpenHarness has multiple API clients and a provider/profile system.

Relevant pieces:

- `api/client.py` for Anthropic-style streaming client
- `api/openai_client.py` for OpenAI-compatible APIs
- `api/registry.py` for provider metadata
- `config/settings.py` for provider workflows and auth resolution
- `ui/runtime.py` for selecting the active API client

The internal message model is normalized, and adapters convert that model to provider wire formats.

This is similar to Nanobot conceptually, but OpenHarness puts more emphasis on provider workflows and user-facing profile switching.

## 10. Background tasks and multi-agent support

The harness has multiple agent/delegation systems:

- `tasks/manager.py` for background shell and agent tasks
- `coordinator/coordinator_mode.py` for coordinator-mode semantics
- `swarm/team_lifecycle.py` and related swarm modules for persistent teams

This is materially broader than Nanobot's subagent tool.

The codebase distinguishes:

- local shell tasks
- local agent tasks
- remote agent tasks
- in-process teammates
- coordinator-only tools and context
- persistent teams stored on disk

So from the agent's perspective, OpenHarness can support both:

- normal single-agent loops
- explicit coordination scenarios

## 11. Session persistence

Session persistence is handled by `services/session_storage.py`.

The harness stores:

- current session snapshot as `latest.json`
- named session files by session ID
- summary, model, usage, system prompt, and message count
- transcript export as markdown

This is straightforward but practical. It enables:

- `/resume` style flows
- UI session lists
- continuity across runs

## 12. AX strengths

- explicit internal conversation model
- strong prompt assembly with CLAUDE.md and memory integration
- first-class permission model
- lifecycle hooks are deeply integrated
- auto-compaction is significantly more advanced than average
- wide tool surface with typed schemas
- real multi-agent/coordinator/swarm design, not just a simple spawn helper
- stream events are structured rather than ad hoc text tags

## 13. AX weaknesses

- the system is complex enough that the true end-to-end mental model is distributed across many modules
- several subsystems are very large, especially compaction, command registry, CLI, UI backend, and swarm modules
- some features appear layered from multiple inspirations, which can make behavior feel composite rather than minimal and unified
- channels and `ohmo` are somewhat separate from the main `oh` runtime model, creating two adjacent harness experiences

## UX: User Experience

## 1. Main user surfaces

OpenHarness has several user-facing surfaces:

- `oh` interactive CLI
- `oh -p` non-interactive print mode
- JSON and stream-JSON output modes
- Textual UI
- React terminal UI with Python backend host
- `ohmo` personal-agent app
- `ohmo gateway` for channel-driven personal-agent interactions

This is a very ambitious UX surface for a relatively young harness.

## 2. CLI UX

The Typer-based CLI in `src/openharness/cli.py` is extensive.

It supports:

- plain interactive sessions
- print mode
- output formatting modes
- session continuation and resume
- model/provider selection
- permission mode changes
- plugin management
- MCP management
- auth and provider management
- cron management

This is much more operationally complete than a simple chat CLI.

## 3. React TUI UX

The React terminal frontend is paired with `ui/backend_host.py` and `ui/protocol.py`.

The protocol is a JSON-lines event/request protocol over stdin/stdout.

Frontend requests include things like:

- submit line
- permission response
- question response
- list sessions
- select command
- shutdown

Backend events include:

- ready
- state snapshot
- transcript items
- compact progress
- assistant delta and complete
- tool started / completed
- modal requests
- task snapshots
- swarm status

This is one of OpenHarness's strongest UX engineering choices. The UI is not tightly coupled to internal Python control flow; it communicates through a structured protocol.

### React backend protocol shape

```text
React frontend
  -> FrontendRequest JSON
Python backend host
  -> RuntimeBundle / QueryEngine
  -> Stream events
  -> BackendEvent JSON
React frontend renders
```

That makes the UI more replaceable and inspectable.

## 4. Slash command UX

OpenHarness has a very large command surface in `commands/registry.py`.

Commands control:

- help and status
- session control
- memory
- plugins
- auth/provider setup
- compaction
- resume/export
- plan mode and related workflow state

This is a strong UX choice for power users because operational state is not hidden.

But it also increases conceptual load.

## 5. Permission-dialog UX

A notable UX behavior is that tool permission decisions can surface interactively through the UI.

The backend host tracks pending permission futures and question futures, and the frontend can answer them through protocol requests.

That means the harness supports a real approve/deny loop instead of only logging denied actions.

This is stronger UX governance than many CLI agents that just fail tools with static policy messages.

## 6. Session UX

Session persistence enables:

- continuation
- explicit resume flows
- named snapshots
- transcript export
- session lists in UI

This improves user trust because the harness feels stateful and resumable.

## 7. `ohmo` UX

`ohmo` is not just a profile. It is a dedicated personal-agent app layered on OpenHarness.

It provides:

- workspace initialization under `~/.ohmo`
- provider profile selection
- channel setup prompts
- memory management
- soul/user file management
- gateway lifecycle commands

This creates a second UX track:

- `oh` as the general harness / coding agent runtime
- `ohmo` as the personal agent product built on top of that harness

That separation is valuable conceptually, but it also means the project supports two overlapping user stories.

## 8. Channel UX

OpenHarness includes channel adapters and an `ohmo` gateway. The channel manager is more hardcoded than Nanobot's registry-driven discovery, but the end-user capability is still broad.

Users can configure channels like:

- Telegram
- Slack
- Discord
- Feishu
- WhatsApp
- Matrix
- Email
- Mochat
- others in the channel implementation set

From a user perspective, `ohmo` is the more coherent channel-facing experience than raw `oh`.

## 9. UX strengths

- multiple ways to interact: CLI, TUI, React TUI, print mode, personal agent, gateway
- structured permission prompts and question prompts
- good operational visibility through slash commands and state snapshots
- resumable sessions
- explicit provider workflow setup
- strong protocol boundary for the React UI
- `ohmo` gives a clearer personal-agent experience than the base harness alone

## 10. UX weaknesses

- a lot of user-facing concepts coexist at once: commands, plugins, hooks, profiles, MCP, tasks, swarm, channels, `ohmo`
- the project may feel heavy for users who only want a simple single-agent CLI
- there are effectively two UX products in one repo: `oh` and `ohmo`
- channel support in the main harness is less unified than Nanobot's channel-first architecture
- large command surface may overwhelm casual users

## DX: Developer Experience

## 1. Extensibility surfaces

OpenHarness is very strong on extension points.

### Tools

Tools are easy to add:

- define a Pydantic input model
- subclass `BaseTool`
- implement `execute()`
- register it

This is friendly to both humans and coding agents.

### Skills

Skills are markdown files loaded from:

- bundled skills
- user skills
- plugin skills

The `skill` tool can load them on demand. This is lightweight and easy to extend.

### Plugins

Plugin loading in `plugins/loader.py` supports:

- manifests
- commands
- skills
- agents
- hooks
- MCP server definitions

It also recognizes Claude-style layouts such as `.claude-plugin/plugin.json`.

This is one of OpenHarness's strongest DX choices: it is intentionally compatible with Claude Code plugin conventions.

### Hooks

Hooks are powerful and programmable, with support for:

- command execution
- HTTP requests
- prompt/agent-based evaluation

That gives developers a serious policy and lifecycle extension layer.

### Providers and auth workflows

Provider workflows and profile handling are structured in settings and registry code. Developers can reason about:

- provider metadata
- auth source
- API format
- default model
- base URL

This is a better DX than scattered environment-variable-only handling.

### UI frontend/backend split

The React TUI's JSON-lines protocol is a DX win because frontend and backend can evolve somewhat independently.

## 2. Code organization quality

OpenHarness is organized into many focused top-level domains, which is good.

But the file-size distribution shows real complexity pressure.

Some very large files include:

- `commands/registry.py` about 1602 lines
- `services/compact/__init__.py` about 1197 lines
- `swarm/permission_sync.py` about 1168 lines
- `channels/impl/feishu.py` about 998 lines
- `coordinator/agent_definitions.py` about 975 lines
- `swarm/team_lifecycle.py` about 910 lines
- `channels/impl/mochat.py` about 897 lines
- `cli.py` about 1387 lines
- `ui/backend_host.py` about 772 lines
- `ohmo/gateway/runtime.py` about 755 lines

So DX is strong at the architectural seam level, but file-level maintainability is becoming an issue.

## 3. Typed interfaces

One of OpenHarness's strengths is its consistent use of typed models:

- Pydantic for tool inputs, settings, protocol models, plugin manifests
- dataclasses for execution and lifecycle objects
- explicit protocol classes for frontend/backend messaging

That is good DX for both human developers and AI coding agents because system contracts are visible in code.

## 4. Testing posture

The repo has an extensive test suite across:

- API clients
- auth
- bridge
- channels
- commands
- config
- coordinator
- engine
- hooks
- MCP
- memory
- `ohmo`
- permissions
- plugins
- prompts
- services
- skills
- swarm
- tasks
- tools
- UI

This is a major DX advantage.

## 5. DX for coding agents

OpenHarness is highly legible to coding agents in some ways:

- tool definitions are patterned
- protocols are explicit
- settings and provider workflows are centralized
- plugin loader behavior is inspectable
- compaction is code-first, not magical
- slash commands expose operational control paths

However, a coding agent may still face high navigation cost because the project is broad and some subsystems are large.

## 6. DX strengths

- many explicit extension seams
- strong type usage throughout the system
- practical plugin compatibility with Claude-style ecosystems
- frontend/backend protocol separation is clean
- rich test coverage
- provider/profile abstraction is well thought out
- skills, hooks, tools, MCP, plugins, and swarm each have recognizable homes

## 7. DX weaknesses

- significant file bloat in key modules
- multiple adjacent architectures coexist: CLI, React backend, Textual UI, `ohmo`, swarm, channels
- some features are clearly borrowed or ported from Claude-style systems, which can make the system feel assembled from sophisticated parts rather than minimized into one clean conceptual core
- there is a lot for contributors to learn before making non-trivial changes

## Runtime Walkthroughs

## Standard `oh` session

```text
user launches `oh`
  -> CLI resolves settings/profile
  -> runtime builder selects API client
  -> MCP manager connects
  -> tool registry created
  -> hook executor created
  -> system prompt assembled
  -> QueryEngine created
  -> user submits prompt
  -> run_query streams model/tool loop
  -> UI renders deltas, tool events, approvals, and completions
```

## React TUI session

```text
React terminal app
  -> Python backend host launched
  -> backend builds RuntimeBundle
  -> frontend sends FrontendRequest JSON
  -> backend host maps to runtime actions
  -> QueryEngine emits StreamEvents
  -> backend transforms them into BackendEvent JSON
  -> frontend renders transcript, tasks, modals, and status
```

## `ohmo` personal-agent flow

```text
user runs `ohmo init/config/run`
  -> separate ~/.ohmo workspace
  -> provider profile chosen via shared workflow model
  -> gateway config stored
  -> optional channels configured
  -> gateway service / runtime launched
  -> channel messages flow through ohmo gateway into harness logic
```

## Concrete Differences vs Nanobot

At a code level, OpenHarness differs from Nanobot in a few major ways.

### More formalized harness layers

OpenHarness has stronger named layers for:

- permissions
- hooks
- compaction
- UI protocol
- plugins
- swarm

Nanobot has many of these ideas, but OpenHarness makes them more explicit as first-class subsystems.

### Less minimal, more framework-like

Nanobot feels like a small operational agent core.
OpenHarness feels like a framework or platform for agent harness experiments and products.

### Stronger governance and control loop

OpenHarness has a more explicit governance story via:

- permission modes
- approval prompts
- hook interception
- plan mode
- path/command rules

### Richer UI engineering

The React backend protocol is a real architectural choice, not just CLI rendering.

### Broader but heavier feature set

OpenHarness offers more surfaces and extension points, but at the cost of complexity.

## Preliminary Non-Scored Assessment

### AX

OpenHarness provides a very rich agent operating environment:

- strong prompt assembly
- structured messages
- typed tools
- permissioned execution
- hook interception
- advanced compaction
- task and swarm semantics

This is one of the strongest AX designs so far, but it is also one of the most complex.

### UX

OpenHarness offers many interaction modes and substantial control surfaces. The UX is especially strong for technical users who want visibility and control. The downside is conceptual heaviness.

### DX

OpenHarness is highly extensible and code-structured in a way that benefits advanced developers and coding agents. The main DX cost is scale and file size, not lack of extension points.

## Final Takeaways

OpenHarness is clearly trying to answer: what does a full open agent harness look like if you keep Claude-style interaction patterns, add typed tools and UI protocols, and expose most of the machinery?

Code-level answer:

- it is much more than a prompt wrapper
- it is strongly harness-oriented
- it has real engineering around permissions, compaction, hooks, and multi-agent control
- it is closer to a harness platform than a small personal-agent runtime

Its biggest strengths are the same things that make it heavy:

- lots of explicit subsystems
- many user and developer control points
- a broad extension surface

Its biggest risk is coherence drift from having so many powerful features living side by side.
