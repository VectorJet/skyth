# Pi Monorepo Exploration

## Scope

This document explores `refs/pi-mono`, with emphasis on the actual harness engineering behind the pi coding agent and its related packages.

Focus areas:

1. AX — Agent experience
2. UX — User experience
3. DX — Developer experience

This is an exploration, not a ranking.

## What Pi Mono Is

`pi-mono` is not one harness. It is a monorepo of agent-related packages.

The most relevant harness for this analysis is:

- `packages/coding-agent` — the interactive coding harness users run as `pi`

But that harness is built on top of two lower-level packages that matter a lot architecturally:

- `packages/agent` — agent runtime with tool loops and stateful control
- `packages/ai` — multi-provider streaming/model abstraction

Additional adjacent packages:

- `packages/tui` — terminal UI toolkit
- `packages/web-ui` — browser/web chat components
- `packages/mom` — Slack bot delegating to pi
- `packages/pods` — model deployment helper CLI

So, unlike Nanobot or OpenHarness, Pi is clearly split into reusable layers rather than implemented as one app-first repository.

## High-Level Architecture

```text
User
  |
  +-- `pi` CLI / interactive TUI
  +-- print mode
  +-- JSON mode
  +-- RPC mode
  +-- SDK embedding
          |
          v
   packages/coding-agent
          |
          +-- AgentSession
          +-- SessionManager
          +-- SettingsManager
          +-- ResourceLoader
          +-- ExtensionRunner
          +-- built-in tools
          +-- compaction
          +-- interactive / print / rpc modes
          |
          v
      packages/agent
          |
          +-- Agent
          +-- agentLoop
          +-- queueing for steering/follow-up messages
          +-- tool execution lifecycle
          |
          v
        packages/ai
          |
          +-- provider/model registry
          +-- streaming APIs
          +-- provider normalization
          +-- OAuth helpers
          |
          v
          LLMs
```

This is one of the cleanest separations seen so far:

- AI provider layer
- generic agent loop layer
- coding-harness/product layer
- TUI layer

## Key Files Read

Main files used in this exploration:

- `refs/pi-mono/packages/coding-agent/README.md`
- `refs/pi-mono/packages/coding-agent/src/main.ts`
- `refs/pi-mono/packages/coding-agent/src/core/sdk.ts`
- `refs/pi-mono/packages/coding-agent/src/core/agent-session.ts`
- `refs/pi-mono/packages/coding-agent/src/core/system-prompt.ts`
- `refs/pi-mono/packages/coding-agent/src/core/tools/index.ts`
- `refs/pi-mono/packages/coding-agent/src/core/extensions/types.ts`
- `refs/pi-mono/packages/coding-agent/src/core/extensions/runner.ts`
- `refs/pi-mono/packages/coding-agent/src/core/session-manager.ts`
- `refs/pi-mono/packages/coding-agent/src/core/compaction/compaction.ts`
- `refs/pi-mono/packages/coding-agent/src/core/skills.ts`
- `refs/pi-mono/packages/coding-agent/src/core/resource-loader.ts`
- `refs/pi-mono/packages/coding-agent/src/modes/rpc/rpc-mode.ts`
- `refs/pi-mono/packages/agent/src/agent-loop.ts`
- `refs/pi-mono/packages/agent/src/agent.ts`
- `refs/pi-mono/packages/ai/src/types.ts`
- `refs/pi-mono/README.md`
- `refs/pi-mono/package.json`

## Architectural Character

Pi is a deliberately minimal harness core surrounded by extension surfaces.

Its stated philosophy is important because the code reflects it:

- no built-in MCP
- no built-in sub-agents
- no built-in plan mode
- no built-in permission popups
- no built-in todos

Instead, Pi tries to make these things buildable via:

- extensions
- skills
- prompt templates
- themes
- pi packages

This is different from OpenHarness, which includes many of those features directly.

## AX: Agent Experience

## 1. What the agent actually sees

The system prompt is assembled by `buildSystemPrompt()` in `packages/coding-agent/src/core/system-prompt.ts`.

It includes:

- a base prompt describing pi as a coding harness
- a list of available tools based on actually enabled tool snippets
- guidelines adjusted to which tools are available
- references to pi documentation paths when the user asks about pi itself
- project context files
- loaded skills
- current date
- current working directory

Pi also loads project context through `ResourceLoader`, which walks for:

- `AGENTS.md`
- `CLAUDE.md`

from global and ancestor directories.

### Prompt structure diagram

```text
system prompt
├─ built-in pi coding-agent prompt
├─ available tools section
├─ tool-aware guidelines
├─ pi-docs guidance section
├─ project context files
│  ├─ ~/.pi/agent/AGENTS.md or CLAUDE.md
│  ├─ ancestor directory AGENTS.md / CLAUDE.md
│  └─ current directory AGENTS.md / CLAUDE.md
├─ skills section (if read tool is active)
├─ current date
└─ current working directory

conversation history
├─ session messages from SessionManager
├─ custom messages
├─ compaction summaries
└─ branch summaries

current turn
└─ new user prompt
```

Compared with OpenHarness, Pi's prompt construction is simpler and more explicit. It does not try to build a huge environment block or governance narrative into the prompt. It focuses on tool availability, context files, and extension-driven augmentation.

## 2. Internal message model

Pi separates internal agent messages from provider wire messages.

This is visible across:

- `packages/agent/src/agent.ts`
- `packages/agent/src/agent-loop.ts`
- `packages/ai/src/types.ts`

The coding agent uses `AgentMessage[]` internally, and only converts to provider `Message[]` at the LLM boundary.

That is a very strong harness design choice.

### Why it matters

It means:

- the harness can preserve richer internal state than any one provider API allows
- transforms and compaction can operate on stable internal message objects
- providers remain adapters, not the source of truth

## 3. The real agent loop

The core loop is in `packages/agent/src/agent-loop.ts`.

There are two important entry paths:

- `agentLoop()` — start from new prompt(s)
- `agentLoopContinue()` — continue from existing context

The loop supports:

- message streaming
- tool calls
- steering messages during work
- follow-up messages after work
- repeated turns until no more tools or queued messages remain

### Loop shape

```text
runAgentLoop
  -> append user prompts to context
  -> emit start events
  -> runLoop
       while tool calls or queued steering exist
         -> optionally inject queued messages
         -> stream assistant response
         -> if tool calls exist
              -> execute tools
              -> append tool results
         -> emit turn end
       -> if queued follow-up messages exist
            -> continue outer loop
       -> end
```

This is one of Pi's distinctive AX features: the queue model is built into the loop itself, not just handled by the UI.

## 4. Steering and follow-up queues

Pi explicitly supports two queued message types:

- steering messages
- follow-up messages

This is exposed in the README and implemented in the agent/runtime layer.

The queue behavior can be configured as:

- `one-at-a-time`
- `all`

This gives the agent a more nuanced interaction model than simple synchronous turns.

### Queue model diagram

```text
user submits while agent is busy
  -> Enter = steering queue
  -> Alt+Enter = follow-up queue

loop behavior
  -> steering injected before next assistant response
  -> follow-up injected after current work fully completes
```

This is a notable AX/UX hybrid strength.

## 5. Tool model

Pi's built-in coding tools are intentionally small and fixed by default.

From `core/tools/index.ts`, defaults are:

- `read`
- `bash`
- `edit`
- `write`

Additional built-ins exist:

- `grep`
- `find`
- `ls`

Tool definitions and tool instances are both available as factories. This is useful because the harness can provide:

- plain tool instances to the agent runtime
- richer `ToolDefinition` wrappers to the coding-agent extension layer

This is cleaner than monolithic tool registries.

## 6. Tool exposure philosophy

Pi does not expose a huge built-in tool surface. Instead, it expects extensions to add more.

This has two major AX effects:

- the base agent operates in a constrained, understandable environment
- complex capability is opt-in

This is much closer to a "small kernel + extensions" philosophy than either Nanobot or OpenHarness.

## 7. Session-aware harness layer: `AgentSession`

The most important coding-agent abstraction is `AgentSession` in `core/agent-session.ts`.

It wraps:

- agent state access
- event subscription
- session persistence
- model switching
- thinking level management
- compaction
- bash execution
- branching and session switching
- extension integration

This class is effectively the real harness object for the product layer.

The README claim that pi runs in multiple modes is backed by code: `AgentSession` is shared across interactive, print, and RPC modes.

This is a major architectural strength.

## 8. Compaction

Pi has a serious compaction system in `core/compaction/compaction.ts`.

Capabilities include:

- token estimation
- compaction triggers based on reserve tokens and recent token retention
- file operation tracking across turns
- summarization of older context
- branch summaries
- structured compaction entries persisted into the session file

Unlike OpenHarness, Pi's compaction is integrated with the session tree and message history model very explicitly.

### Compaction model

```text
session history grows
  -> estimate context tokens
  -> if threshold exceeded
       -> find cut point
       -> summarize older branch/history
       -> keep recent messages
       -> persist compaction entry in session JSONL
       -> reload context from session manager
```

This is one of Pi's strongest harness features.

## 9. Session tree and branching

Pi's `SessionManager` is not a plain linear transcript store.

It stores entries with:

- `id`
- `parentId`

That means session history is inherently tree-structured.

Supported concepts include:

- branching in-place
- compaction entries
- branch summaries
- custom extension entries
- custom extension messages
- labels/bookmarks
- session info metadata

This is a very strong AX feature because it gives the agent and user a persistent branching conversation structure rather than a flat chat log.

## 10. Extensions as first-class runtime participants

Extensions are not just tools. The extension type system in `core/extensions/types.ts` and runtime in `core/extensions/runner.ts` allow extensions to:

- register tools
- register commands
- register keyboard shortcuts
- react to lifecycle events
- intercept input
- change status lines and UI widgets
- create custom dialogs/editors
- customize compaction
- trigger session changes
- inject custom messages into context

This is one of the broadest extension contracts seen so far.

It means the agent experience is highly malleable without modifying core.

## 11. RPC and SDK modes

Pi is engineered as a reusable runtime, not just a terminal app.

### SDK

`core/sdk.ts` provides `createAgentSession()` and exports the major harness primitives.

### RPC

`modes/rpc/rpc-mode.ts` exposes a JSONL stdin/stdout protocol for embedding.

This means the agent experience can be delivered through:

- local TUI
- print mode
- external process integrations
- direct SDK embedding

That is a real harness-quality abstraction.

## 12. AX strengths

- clear separation between provider layer, agent loop layer, and coding-agent layer
- internal message model is not provider-bound
- session tree model is powerful and elegant
- steering/follow-up queues are deeply integrated
- compaction is sophisticated and session-aware
- extensions can shape both runtime and UI behavior heavily
- SDK and RPC modes are real first-class modes, not afterthoughts

## 13. AX weaknesses

- some critical files are extremely large, especially `agent-session.ts` and interactive mode
- many advanced capabilities are extension-driven, which means base behavior can feel intentionally sparse
- the harness relies on the reader understanding several packages at once, not one central runtime file
- the absence of built-in governance features means default AX is powerful but not strongly guarded

## UX: User Experience

## 1. Main user surfaces

Pi supports four main usage patterns:

- interactive TUI
- print mode
- JSON mode
- RPC mode

And a fifth for developers:

- SDK embedding

The README is very explicit about this, and the code architecture supports it.

## 2. Interactive UX

Pi's main UX is the interactive terminal mode.

From the README and code, the interface includes:

- startup header
- message area
- editor
- footer

The editor supports:

- file fuzzy search via `@`
- path completion
- multiline entry
- image paste/drag
- inline shell commands via `!` and `!!`

This is a relatively polished terminal UX.

## 3. Commands and navigation UX

Pi includes many slash commands, such as:

- `/login`
- `/model`
- `/settings`
- `/resume`
- `/new`
- `/tree`
- `/fork`
- `/compact`
- `/copy`
- `/export`
- `/reload`

The session tree UX is particularly notable.

### Tree UX concept

```text
/tree
  -> navigate session branches in one file
  -> jump to old points
  -> continue from there
  -> label bookmarks
  -> switch branch views
```

This is a rare and strong UX feature for an agent harness.

## 4. Message queue UX

As noted above, the queue behavior is exposed directly to the user via keyboard shortcuts.

This creates a more fluid interactive experience than tools that force the user to wait until the current turn ends before providing additional instructions.

## 5. Settings UX

Pi supports both:

- slash-command settings (`/settings`)
- JSON config editing in:
  - `~/.pi/agent/settings.json`
  - `.pi/settings.json`

It also supports project-local resource directories and context files.

That is a solid UX balance between discoverable UI and file-based control.

## 6. Package UX

Pi's package system is a major UX and DX surface.

Users can:

- install extensions/skills/prompts/themes from npm or git
- enable/disable them via `pi config`
- update or remove them

This makes the harness feel like a platform rather than a fixed app.

## 7. Session UX

Session behavior is strong:

- auto-save
- continue most recent
- browse previous
- ephemeral mode
- explicit session path or ID
- forking
- export to HTML

This makes long-lived use practical and inspectable.

## 8. UX strengths

- polished terminal-first experience
- powerful branch/tree session UX
- clear multi-mode story: interactive, print, JSON, RPC
- package install/config flows make customization accessible
- queueing model improves live interaction
- good balance between command-driven control and file-driven customization

## 9. UX weaknesses

- the philosophy of omitting many features can feel like missing batteries for some users
- some advanced capabilities depend on users finding/installing extensions rather than simply turning on a built-in feature
- the customization surface is broad enough that it may be intimidating
- because Pi is highly configurable, different users may effectively have very different products

## DX: Developer Experience

## 1. Strong package decomposition

Pi's monorepo structure is one of its biggest DX strengths.

Developers can work at the right layer:

- `pi-ai` for providers and models
- `pi-agent-core` for agent loop behavior
- `pi-coding-agent` for the coding harness
- `pi-tui` for UI
- `pi-web-ui` for browser components

This is a genuinely reusable architecture.

## 2. Extension system quality

Pi's extension type system is very broad and well-articulated.

Extensions can:

- register tools
- register commands
- register keybindings
- add UI components and overlays
- change footer/header/editor behavior
- observe lifecycle events
- manipulate sessions
- influence compaction
- create custom dialogs

The examples directory is large and concrete, which is a huge DX advantage.

This is one of the best coding-agent extension ecosystems among the harnesses reviewed so far.

## 3. Skills, prompts, themes, packages

Pi's resource model is clean:

- skills
- prompt templates
- themes
- extensions
- packages bundling all of them

And `ResourceLoader` centralizes their discovery and reload behavior.

That is very good DX because the resource system is coherent.

## 4. SDK quality

`createAgentSession()` in `core/sdk.ts` is a major DX win.

It means a developer can embed the harness without copying internal CLI behavior. The SDK exposes:

- model/auth/session/resource defaults
- access to tools and custom tools
- extension/runtime integration
- in-memory or persisted sessions

This is a hallmark of a mature harness.

## 5. RPC mode for non-Node consumers

The JSONL RPC mode is another DX advantage. It enables integration from languages and runtimes that do not want to directly embed Node modules.

This makes Pi more of a harness platform than only an app.

## 6. Types and contracts

Pi uses TypeScript aggressively and has strong type surfaces across:

- provider models
- tool definitions
- extension APIs
- session entries
- runtime options

That makes the codebase easier for both humans and coding agents to navigate.

## 7. Testing posture

The repo has extensive tests, especially in:

- `packages/ai`
- `packages/agent`
- `packages/coding-agent`
- `packages/tui`

This is a strong DX signal.

## 8. DX weaknesses

- many files are very large:
  - `agent-session.ts` about 3059 lines
  - `interactive-mode.ts` about 4649 lines
  - `package-manager.ts` about 2241 lines
  - `extensions/types.ts` about 1450 lines
  - `session-manager.ts` about 1419 lines
- the monorepo split is clean, but it also means contributors often need to understand multiple packages to change core behavior
- the extension system is powerful enough that learning the full surface area takes time
- some minimalism at the philosophy layer means developers may need to build features that other harnesses simply ship by default

## Runtime Walkthroughs

## Standard CLI path

```text
user runs `pi`
  -> `packages/coding-agent/src/main.ts`
  -> parse args and choose mode
  -> create session manager, settings manager, resource loader
  -> createAgentSession()
  -> AgentSession wraps Agent + resources + sessions + extensions
  -> interactive mode / print mode / json mode / rpc mode runs on top
```

## Agent loop path

```text
AgentSession.prompt(...)
  -> Agent from `pi-agent-core`
  -> agentLoop or agentLoopContinue
  -> convert internal AgentMessage[] to provider Message[]
  -> stream assistant response
  -> execute tools
  -> append tool results
  -> continue until no tools / no queued messages
```

## Resource loading path

```text
ResourceLoader.reload()
  -> discover extensions
  -> discover skills
  -> discover prompt templates
  -> discover themes
  -> load AGENTS.md / CLAUDE.md context files
  -> load system prompt overrides
```

## Session path

```text
SessionManager
  -> JSONL file with tree structure
  -> message entries
  -> model/thinking changes
  -> custom entries
  -> custom messages
  -> labels
  -> compaction entries
  -> branch summaries
```

## Comparison Notes vs OpenHarness and Nanobot

Pi is distinct from the other harnesses explored so far.

### Compared to Nanobot

- Pi is more modular at the package level
- Pi has stronger extension and SDK surfaces
- Pi has a more advanced session tree model
- Nanobot is more batteries-included for channels and personal-agent operation

### Compared to OpenHarness

- Pi is more intentionally minimal in core policy and built-in features
- OpenHarness bakes in more governance and orchestration directly
- Pi leans harder on extensibility instead of shipping every harness pattern in core
- Pi's SDK and package ecosystem feel especially central, not incidental

## Preliminary Non-Scored Assessment

### AX

Pi provides a strong and elegant agent runtime:

- clear internal message model
- strong loop semantics
- queue-aware interaction
- session-tree persistence
- compaction integrated with history structure
- extension-driven adaptability

Its AX is less about built-in breadth and more about a clean, composable kernel.

### UX

Pi's UX is strongest for terminal-native power users. The session tree, queueing, and package-driven customization are standout features. Users wanting batteries-included governance or orchestration may need packages or custom extensions.

### DX

Pi is arguably the strongest DX-oriented harness examined so far, especially for developers who want to build on top of it. The main cost is scale and a few extremely large implementation files.

## Final Takeaways

Pi is engineered around a clear idea:

- keep the core harness small
- make the runtime reusable
- make the product layer adaptable
- push workflow specialization into extensions, skills, prompt templates, and packages

At the code level, that idea is real.

The strongest engineering traits are:

- layered package architecture
- stable internal message abstraction
- reusable session/runtime APIs
- sophisticated session tree and compaction model
- unusually powerful extension system

The main tradeoff is also clear:

- the default harness is intentionally less opinionated and less feature-complete than something like OpenHarness
- advanced workflows often depend on extension work rather than core toggles

That makes Pi feel less like a finished product shell and more like a serious harness toolkit with a strong default coding-agent app on top.
