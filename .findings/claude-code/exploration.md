# Claude Code Exploration

## Scope

This document explores `refs/claude-code` as an engineered harness, focusing on:

- AX — Agent experience
- UX — User experience
- DX — Developer experience

This is an exploration, not a ranking.

## Important Caveat About This Reference

This repository is not a normal source repo. It is a **source-preserved rebuild** of Claude Code from source maps.

That matters for interpretation:

- it exposes a lot of real implementation detail
- but the repo shape is partly reconstruction-oriented
- some boundaries may reflect bundling/extraction artifacts as much as original source organization

Even with that caveat, the code is detailed enough to analyze the harness architecture seriously.

## What Claude Code Actually Is

At code level, Claude Code is not just a terminal chat app.

It is a **large multi-mode agent runtime** centered on one primary conversation engine, with several surrounding execution surfaces:

- interactive local TUI / REPL
- headless SDK / `--print` mode
- background sessions
- remote-control / bridge mode
- direct-connect remote sessions
- SSH-backed sessions
- MCP integration
- worktree and multi-agent/coordinator features

The architectural center of gravity is not the UI. It is the pair:

- `src/QueryEngine.ts`
- `src/query.ts`

Those files are where the real turn execution, tool orchestration, compaction, retry, and continuation logic live.

## Core Architectural Thesis

Claude Code's design appears to be:

1. **one core query/turn engine**
   - model loop
   - tool loop
   - compaction/recovery logic
   - transcript/session mutation

2. **many entry surfaces around that engine**
   - local CLI/TUI
   - SDK/headless
   - remote sessions
   - bridge/remote-control
   - direct-connect servers

3. **tooling and permissions are first-class runtime policy**
   - tools are filtered before prompt exposure
   - permissions shape both prompt and execution
   - deny rules can hide tools from the model entirely

4. **performance and prompt-cache stability are treated as product features**
   - aggressive fast paths in CLI boot
   - system prompt section caching
   - tool ordering stability
   - context compaction and token budgeting

This makes Claude Code feel like a highly optimized production harness rather than a cleanly layered reference framework.

## Key Files Read

### Entry/runtime
- `refs/claude-code/README.md`
- `refs/claude-code/package.json`
- `refs/claude-code/source/package.json`
- `refs/claude-code/source/src/entrypoints/cli.tsx`
- `refs/claude-code/source/src/main.tsx`

### Core agent/query engine
- `refs/claude-code/source/src/QueryEngine.ts`
- `refs/claude-code/source/src/query.ts`
- `refs/claude-code/source/src/query/config.ts`
- `refs/claude-code/source/src/Tool.ts`
- `refs/claude-code/source/src/tools.ts`
- `refs/claude-code/source/src/Task.ts`
- `refs/claude-code/source/src/constants/systemPromptSections.ts`

### Remote / bridge / direct-connect
- `refs/claude-code/source/src/bridge/sessionRunner.ts`
- `refs/claude-code/source/src/bridge/bridgeMain.ts`
- `refs/claude-code/source/src/remote/RemoteSessionManager.ts`
- `refs/claude-code/source/src/remote/SessionsWebSocket.ts`
- `refs/claude-code/source/src/server/directConnectManager.ts`
- `refs/claude-code/source/src/server/createDirectConnectSession.ts`
- `refs/claude-code/source/src/assistant/sessionHistory.ts`

## High-Level Architecture

```text
entrypoints
├─ cli / TUI
├─ --print / SDK
├─ remote-control bridge
├─ direct-connect
├─ remote session attach/viewer
└─ background / daemon-ish flows
        |
        v
main.tsx
├─ huge startup/init/policy/config pipeline
├─ command routing
├─ session/bootstrap state
└─ REPL or headless dispatch
        |
        v
QueryEngine
├─ prompt processing
├─ system prompt assembly
├─ slash-command preprocessing
├─ transcript/session persistence
├─ SDK message framing
└─ per-turn orchestration
        |
        v
query.ts
├─ actual model/tool loop
├─ streaming handling
├─ compaction / snip / context collapse
├─ fallback / recovery
├─ budget enforcement
└─ stop hooks / continuation transitions
        |
        v
tools + MCP + permissions + tasks + remote transports
```

## Architectural Character

Claude Code is the most obviously **production-hardened** harness in the set so far.

Its code repeatedly reveals priorities like:

- startup latency
- prompt-cache preservation
- safe resumption
- low transcript corruption risk
- remote session continuity
- feature gating via build flags and runtime gates
- graceful recovery from token/context/provider problems

It is less "clean architecture textbook" than Pi and less "explicit product platform" than OpenCode or OpenClaw. It feels more like a mature internal product that kept accumulating capabilities around a very capable loop.

## AX: Agent Experience

## 1. QueryEngine is the conversational state owner

`QueryEngine` is the harness abstraction that holds:

- mutable conversation messages
- abort controller
- permission denials
- accumulated usage
- read-file cache
- turn-local skill discovery state
- nested memory path tracking

It exposes `submitMessage()` as the main conversation-step API.

This is an important design choice: Claude Code gives the agent runtime a durable engine object rather than recomputing everything from scratch per prompt.

That enables:

- multi-turn state continuity
- transcript persistence
- turn-level retries and replays
- a stable SDK-facing event stream

## 2. QueryEngine is a wrapper around the deeper loop, not the loop itself

`QueryEngine.submitMessage()` does a lot, but it is not the deepest runtime.

The split is:

- `QueryEngine.ts` owns session/SDK/headless orchestration
- `query.ts` owns the actual streaming model/tool loop

That separation is meaningful.

`QueryEngine` handles:

- system prompt construction via `fetchSystemPromptParts()`
- user/slash-command preprocessing via `processUserInput()`
- transcript writes before the API call
- SDK message replay framing
- result shaping and usage aggregation
- headless-mode concerns like structured output and replayable messages

`query.ts` handles:

- iterative model calls
- tool execution and tool-result continuation
- compaction, snip, reactive compact, context collapse
- output-token recovery
- prompt-too-long recovery
- model fallback
- stop-hook behavior

This is one of the clearest examples in the set of a runtime split between **conversation harness** and **execution kernel**.

## 3. The real loop is extremely engineered

`query.ts` is the most technically dense agent loop seen so far.

It is not a simple:

- send messages
- get tool calls
- execute tools
- send results

loop.

It contains multiple interacting mechanisms:

- auto-compact
- reactive compact
- history snip
- context collapse
- microcompact / cached microcompact
- tool-result budgeting
- max-output-token escalation and recovery
- prompt-too-long withholding and recovery
- fallback model retry
- streaming tool execution
- stop hooks and stop-failure hooks
- per-turn token budget tracking
- task budget carryover across compaction boundaries

This means Claude Code's AX is built around one core promise:

**keep the agent running and salvage the turn whenever possible.**

## 4. Compaction is not a side utility; it is central runtime behavior

Claude Code has several context-management mechanisms layered together:

- `buildPostCompactMessages()`
- auto-compact tracking state
- history snip
- microcompact
- context collapse
- reactive compact
- token warning state / blocking limit logic

This is beyond "conversation summarization".

It is a context-lifecycle system.

The sequence in `query.ts` is especially notable:

1. apply tool result budget
2. apply snip
3. apply microcompact
4. apply context collapse
5. apply autocompact
6. only then continue with model execution

That is sophisticated and shows the harness has evolved around real prompt-window pain.

## 5. Recovery behavior is unusually strong

Claude Code often withholds intermediate failure messages until it knows whether recovery will succeed.

Examples in `query.ts`:

- prompt-too-long errors may be withheld while collapse/reactive compact retry paths run
- media-size errors may be withheld while reactive compact strips/retries
- `max_output_tokens` may trigger an escalated retry before surfacing failure

This is a subtle but powerful AX feature.

Why it matters:

- remote clients or desktop wrappers may terminate a session when they see an error
- if the runtime leaked every intermediate failure, recovery paths would be useless

So the harness is engineered around **error semantics as protocol design**, not just logging.

## 6. Tooling is broad, filtered, and prompt-aware

`tools.ts` is the main tool catalog surface.

Core built-ins include:

- agent / subagent
- bash
- read / edit / write
- notebook edit
- glob / grep
- web fetch / web search
- todo/task tools
- ask-user tool
- skill tool
- plan mode tools
- task output / task stop
- MCP resource tools
- LSP tool
- worktree tools
- send-message/team tools
- REPL wrapper mode
- browser/computer-use related tools under gates

But the important architectural point is not breadth alone.

It is this:

- tools are gathered in one source-of-truth function
- filtered by deny rules before the model sees them
- shaped differently for simple mode / REPL mode / coordinator mode
- sorted and assembled partly for prompt-cache stability

This is more careful than many harnesses, where tool exposure is just a runtime list.

## 7. Permission policy is coupled to tool visibility

`filterToolsByDenyRules()` is especially revealing.

Claude Code does not merely deny tools at execution time. It can remove them from the model-visible tool pool entirely.

This has two effects:

- security/policy improvement
- prompt stability and model behavior improvement

That is a mature design choice. It is much better than advertising tools the model cannot actually use.

## 8. System prompt engineering includes cache discipline

`constants/systemPromptSections.ts` shows a memoized section system with:

- cached sections
- intentionally dangerous uncached sections
- explicit cache-break semantics
- reset behavior on `/clear` and `/compact`

That is a strong signal about how Claude Code is engineered.

The system prompt is not treated as a monolith. It is treated as a **cache-sensitive assembled artifact**.

That matters because the repo also comments repeatedly on keeping prompt-cache keys stable:

- tool order stability
- section caching
- settings path hashing to avoid cache busting
- preserving built-in tool prefixes ahead of MCP tools

This may be the strongest prompt-cache-conscious harness explored so far.

## 9. Tasking and background execution are real subsystems

`Task.ts` shows typed background task categories such as:

- `local_bash`
- `local_agent`
- `remote_agent`
- `in_process_teammate`
- `local_workflow`
- `monitor_mcp`
- `dream`

So Claude Code is not just a foreground single-turn tool runner.

It supports a richer internal task model with:

- task IDs
- terminal-state semantics
- output file paths
- task-specific cleanup/kill behavior

This lines up with the tool catalog, which includes `Task*` tools and agent/team capabilities.

## 10. Remote control is not a bolt-on; it is a second execution topology

`bridge/bridgeMain.ts` and `bridge/sessionRunner.ts` show a substantial remote-control system.

The bridge can:

- register an environment
- poll for work from a remote control plane
- spawn local Claude child sessions in `--print --sdk-url` mode
- maintain session status/activity
- relay permission requests
- refresh access tokens
- manage session timeouts
- archive sessions
- use worktree or same-dir spawn modes
- run multi-session capacity management

This is much more than "connect web UI to CLI".

It is effectively a **remote orchestration shell for local Claude workers**.

### Remote-control flow

```text
web/app/backend work item
  -> bridge poll loop
  -> spawn child `claude --print --sdk-url ...`
  -> child emits NDJSON SDK/control messages
  -> bridge tracks activities / permissions / titles / tokens
  -> work item completes or stays resumable
```

This is one of Claude Code's most distinctive engineering traits.

## 11. Direct-connect and remote-session support widen the agent surface

There are at least two more remote/session patterns in the code read here:

### Direct connect
- `createDirectConnectSession.ts`
- `directConnectManager.ts`

This path creates a session on a remote server and then speaks over WebSocket with SDK/control messages.

### Remote session manager
- `RemoteSessionManager.ts`
- `SessionsWebSocket.ts`

This manages a session already hosted remotely, including:

- message streaming
- permission request/response
- reconnect logic
- interrupt signaling

This means Claude Code's agent experience is not tied to one transport.

It has a reusable message protocol carried across:

- local headless mode
- bridge mode
- direct-connect
- remote attached sessions

That protocol reuse is a major architectural strength.

## 12. AX strengths

- one of the most recovery-capable query loops seen so far
- QueryEngine / query split is strong and practical
- context management is deeply engineered, not superficial
- tool visibility and permission policy are tightly integrated
- remote-control and remote-session execution reuse the same SDK/control idioms
- background tasks and multi-agent/team features look native, not bolted on
- prompt-cache stability is treated as a first-class runtime concern

## 13. AX weaknesses

- conceptual complexity is very high
- there are many interacting recovery/compaction mechanisms to reason about
- feature-gated behavior can make the mental model harder to predict
- core behavior is concentrated in a few enormous files

## UX: User Experience

## 1. Startup path is aggressively optimized

`entrypoints/cli.tsx` is one of the clearest examples of UX-through-performance engineering.

It provides many fast paths before loading the full CLI:

- `--version`
- `--dump-system-prompt`
- browser/native host helpers
- computer-use MCP server
- daemon worker
- `remote-control`
- `daemon`
- background session commands (`ps`, `logs`, `attach`, `kill`)
- template job commands
- environment/self-hosted runner commands
- tmux/worktree fast path

That means Claude Code is engineered to avoid paying full startup cost when a cheap path will do.

This is excellent UX for a frequently used CLI.

## 2. The CLI product is really multi-mode

From `main.tsx`, the user can end up in many modes:

- fully interactive TTY session
- non-interactive print mode
- SDK-driven session
- remote session
- assistant-specific flows
- SSH-backed session
- direct-connect session
- worktree/tmux session

This is broader than Pi or OpenCode in transport/mode diversity, though less broad than OpenClaw in channel diversity.

## 3. Session continuity is a major UX theme

The code repeatedly optimizes for not losing sessions:

- transcript recording happens before the query loop starts
- eager flush options exist for vulnerable execution environments
- bridge mode preserves resumable sessions
- session history is paged remotely in `assistant/sessionHistory.ts`
- reconnect logic exists in remote session websockets
- bridge mode can requeue token-expired sessions

This is a very strong practical UX trait.

Claude Code seems acutely aware that users care about resuming interrupted work.

## 4. Remote-control UX is unusually polished in architecture terms

`bridgeMain.ts` is massive because it is doing a lot of UX work:

- environment registration
- session status lines
- capacity displays
- session titles
- active work summaries
- graceful shutdown and resume hints
- session worktree isolation
- polling/heartbeat behavior
- reconnect and token refresh

This is not just networking glue. It is user-facing operational UX.

The bridge essentially turns the local CLI into an attachable remote workstation.

## 5. Permission UX is protocolized

Both `RemoteSessionManager` and `DirectConnectSessionManager` carry explicit control requests for permissions.

That means permission prompts are not just local terminal affordances. They are part of the session protocol.

This is an important UX capability because it lets Claude Code preserve approval semantics across local and remote surfaces.

## 6. Tool/result streaming is designed for multiple clients

The headless/SDK paths emit normalized messages like:

- assistant
n- user replay
- tool use summary
- compact boundary
- stream events
- result messages with structured metadata

This gives Claude Code a stronger external-client UX story than harnesses that only stream plain text.

## 7. Worktree and SSH modes improve serious repo UX

From `main.tsx` and bridge logic, Claude Code is clearly engineered around real repo workflows:

- tmux worktree exec fast path
- SSH remote mode parsing and routing
- worktree spawn mode in bridge sessions
- path and repo continuity concerns

That is practical UX for heavy coding workflows, not just chat.

## 8. UX strengths

- very strong startup-performance discipline
- session continuity/resume is deeply engineered
- remote-control UX is a standout feature
- approval/permission flows survive across remote transports
- multiple serious developer workflows are supported: print, interactive, SSH, worktree, bridge
- SDK/control message model gives external clients a richer UX surface

## 9. UX weaknesses

- feature breadth likely hurts discoverability
- many modes mean more state combinations and edge cases
- some advanced UX depends on infrastructure the average user will never configure
- the product surface appears powerful but operationally dense

## DX: Developer Experience

## 1. This is a product codebase before it is a framework

Claude Code exposes many seams, but it does not read like a clean extension-first platform in the way Pi or OpenClaw do.

Its code is optimized for shipping the product itself.

That means DX is mixed:

- strong internal abstractions in places
- weaker approachability for external adaptation

## 2. Tool abstraction is solid

`Tool.ts` is one of the strongest API surfaces in the repo.

It defines:

- tool schemas and descriptions
- permission checks
- read-only/destructive/concurrency semantics
- prompt rendering
- UI rendering for use/progress/result/error/rejected states
- MCP metadata support
- classifier input projection
- prompt text generation
- search/read/list classification
- hooks for observability input backfilling

This is a very mature tool contract.

Compared with simpler harnesses, Claude Code tools are not only execution functions. They are full UX/runtime objects.

## 3. Tool assembly discipline is excellent

`tools.ts` serves as the single source of truth for built-in tool inventory.

It also encodes:

- build-time gating via `feature()`
- environment gating via `process.env`
- deny-rule filtering
- REPL/simple/coordinator variations
- MCP merge rules
- ordering for prompt-cache stability

This is high-quality runtime engineering, even if it makes the file somewhat busy.

## 4. Protocol reuse is a DX strength

The same SDK/control message model appears across:

- headless mode
- bridge session children
- remote sessions
- direct-connect

That reduces surface fragmentation.

A developer building a client or remote wrapper can reason about one family of message/control types instead of several unrelated protocols.

## 5. Performance engineering is pervasive

Claude Code's DX reveals intense attention to:

- startup import minimization
- lazy imports
- feature-gated dead-code elimination
- cache-key stability
- avoiding random-path cache busting
- avoiding unnecessary module graphs in hot paths

This is admirable engineering, but it also creates a codebase with many micro-optimizations and comments explaining them.

That makes maintenance more demanding.

## 6. File-size concentration is extreme

Representative large files:

- `src/main.tsx` — 4683 lines
- `src/bridge/bridgeMain.ts` — 2999 lines
- `src/query.ts` — 1729 lines
- `src/QueryEngine.ts` — 1295 lines

This is a major DX weakness.

Even though there are lots of modules, some of the most important behavior is concentrated in giant orchestrators.

That makes onboarding and safe modification harder.

## 7. Feature gating is both strength and burden

Claude Code relies heavily on:

- `feature(...)` build-time gates
- runtime env flags
- GrowthBook/statsig-style runtime gates

This has real benefits:

- dead-code elimination
- staged rollout
- internal/external build differentiation

But the DX cost is real:

- understanding "what actually runs" requires knowing gate state
- reading source in isolation can mislead
- behavior can differ materially between builds and users

## 8. Remote-control subsystem is impressive but heavy

`bridgeMain.ts` plus `sessionRunner.ts` form a mini-platform inside the product.

For DX this is both:

- a strength, because it exposes a sophisticated remote execution model
- a weakness, because it adds another very large mental subgraph to learn

## 9. DX strengths

- very strong tool contract
- good reuse of SDK/control protocol across surfaces
- excellent runtime engineering around performance and cache stability
- careful comments explaining non-obvious production decisions
- serious support for remote, background, and multi-session product features

## 10. DX weaknesses

- enormous core files
- product complexity outweighs elegance in several places
- heavy feature gating complicates reasoning
- external-extension story is less obvious than in Pi or OpenClaw
- many subsystems are tightly optimized and therefore harder to refactor casually

## Context Window and Tool-Calling Diagrams

## Main turn path

```text
user input
  -> main.tsx / mode routing
  -> QueryEngine.submitMessage()
       -> fetch system prompt parts
       -> process user input / slash commands
       -> persist transcript
       -> emit system init message
       -> call query()
            -> compact/snip/collapse pipeline
            -> call model with streaming
            -> collect tool_use blocks
            -> run tools / stream tool results
            -> retry / fallback / compact if needed
       -> emit final SDK result message
```

## Context-management stack

```text
messages
  -> tool result budget
  -> history snip
  -> microcompact
  -> context collapse
  -> autocompact
  -> reactive compact / recovery if overflow still occurs
```

## Remote-control topology

```text
remote control plane
  -> bridge poll loop
  -> local child claude process (`--print --sdk-url`)
  -> NDJSON SDK/control stream
  -> permissions / status / title / token refresh handling
  -> resumable session lifecycle
```

## Comparison Notes vs Pi, OpenCode, Codebuff, and OpenClaw

### Compared to Pi

- Claude Code is far more production-hardened and feature-heavy
- Pi has cleaner core abstractions and better extension ergonomics
- Claude Code is stronger on recovery logic, remote-control, and prompt-cache discipline
- Pi is easier to understand as a reusable harness core

### Compared to OpenCode

- both are productized and session-aware
- Claude Code is more aggressively optimized and more protocol-rich
- OpenCode feels cleaner as an integrated coding product runtime
- Claude Code appears stronger on continuation/recovery and remote-control machinery

### Compared to Codebuff

- Codebuff is more explicitly multi-agent-specialist oriented
- Claude Code is more centered on one extremely capable query loop with many runtime modes
- Codebuff's orchestration is easier to see in agent definitions
- Claude Code's sophistication is concentrated in turn management and transport/runtime engineering

### Compared to OpenClaw

- OpenClaw is broader as a gateway/platform
- Claude Code is more focused on coding-agent execution itself
- Claude Code has a tighter local/remote coding harness story
- OpenClaw is broader in channels/devices/plugins; Claude Code is more focused on a polished coding runtime

## Preliminary Non-Scored Assessment

### AX

Claude Code has one of the strongest single-loop agent runtimes examined so far. Its compaction, retry, fallback, streaming, and recovery behavior are unusually mature.

### UX

Its biggest UX differentiators are startup performance discipline, resumability, and remote-control. It is much more than a local terminal app.

### DX

Claude Code is technically impressive but not lightweight. Tool abstractions and protocol reuse are strong; overall approachability suffers from giant orchestrator files and heavy gating.

## Final Takeaways

Claude Code is engineered like a mature, performance-sensitive production harness.

Its defining traits are:

- a very strong `QueryEngine` + `query.ts` execution core
- serious context-window lifecycle management
- protocolized tool/permission/result streaming
- multiple execution topologies: local, headless, bridge, direct-connect, remote
- strong attention to prompt-cache and startup-performance stability
- practical investment in resumability and session continuity

Its biggest tradeoff is complexity concentration.

The system is powerful because it keeps adding recovery, transport, and optimization layers around one core loop. But that also makes the code harder to reason about than smaller or cleaner harnesses.

If Pi is the cleaner harness toolkit and OpenClaw is the broader assistant platform, Claude Code looks like the most mature **shipping coding-agent runtime** in the set so far, with a particularly strong emphasis on reliability, session continuity, and transport-aware execution.
