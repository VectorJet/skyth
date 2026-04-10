# Codebuff Exploration

## Scope

This document explores `refs/codebuff` as an engineered harness, focusing on:

- AX — Agent experience
- UX — User experience
- DX — Developer experience

This is an exploration, not a ranking.

## What Codebuff Is

Codebuff is a Bun/TypeScript monorepo whose coding harness is split across three main layers:

- `cli/` — terminal UI
- `sdk/` — orchestration plus local tool execution
- `packages/agent-runtime/` — core agent loop and template runtime

A fourth major pillar is also essential:

- `agents/` — shipped agent definitions that embody Codebuff's multi-agent strategy

So unlike Pi, which exposes a cleaner reusable runtime stack, and unlike OpenCode, which centralizes much of its runtime into one product package, Codebuff distributes the harness across:

- UI shell
- SDK orchestration
- runtime engine
- agent-template library

That architectural split matters a lot, because Codebuff's product idea is not just "a coding assistant" but specifically **an orchestrated specialized-agent system**.

## High-Level Architecture

```text
user
  |
  v
CLI TUI (`cli/`)
  |
  v
SDK (`sdk/`)
  |
  +-- initializes / restores SessionState
  +-- loads local agents and skills
  +-- registers local tool handlers
  +-- executes tools on user's machine
  |
  v
agent-runtime (`packages/agent-runtime`)
  |
  +-- mainPrompt()
  +-- loopAgentSteps()
  +-- runAgentStep()
  +-- runProgrammaticStep()
  +-- system prompts / template resolution
  |
  v
agent templates (`agents/` and local `.agents/`)
  |
  +-- base orchestrator
  +-- editor
  +-- thinker
  +-- reviewer
  +-- file pickers / researchers / bashers
  +-- context-pruner
  |
  v
LLM providers / Codebuff backend
  |
  +-- direct OAuth paths where available
  +-- backend chat completions proxy otherwise
  |
  v
tool execution on local machine via SDK
```

## Key Files Read

Primary code used for this exploration:

- `refs/codebuff/README.md`
- `refs/codebuff/docs/architecture.md`
- `refs/codebuff/docs/request-flow.md`
- `refs/codebuff/docs/agents-and-tools.md`
- `refs/codebuff/cli/README.md`
- `refs/codebuff/cli/package.json`
- `refs/codebuff/sdk/package.json`
- `refs/codebuff/packages/agent-runtime/package.json`
- `refs/codebuff/sdk/src/client.ts`
- `refs/codebuff/sdk/src/run.ts`
- `refs/codebuff/sdk/src/impl/agent-runtime.ts`
- `refs/codebuff/sdk/src/impl/llm.ts`
- `refs/codebuff/sdk/src/agents/load-agents.ts`
- `refs/codebuff/sdk/src/skills/load-skills.ts`
- `refs/codebuff/sdk/src/run-state.ts`
- `refs/codebuff/packages/agent-runtime/src/main-prompt.ts`
- `refs/codebuff/packages/agent-runtime/src/run-agent-step.ts`
- `refs/codebuff/packages/agent-runtime/src/run-programmatic-step.ts`
- `refs/codebuff/packages/agent-runtime/src/prompt-agent-stream.ts`
- `refs/codebuff/packages/agent-runtime/src/templates/agent-registry.ts`
- `refs/codebuff/packages/agent-runtime/src/system-prompt/prompts.ts`
- `refs/codebuff/cli/src/index.tsx`
- `refs/codebuff/cli/src/app.tsx`
- `refs/codebuff/cli/src/chat.tsx`
- `refs/codebuff/cli/src/hooks/use-send-message.ts`
- `refs/codebuff/cli/src/utils/create-run-config.ts`
- `refs/codebuff/cli/src/utils/sdk-event-handlers.ts`
- `refs/codebuff/agents/base2/base2.ts`
- `refs/codebuff/agents/base2/base2-plan.ts`
- `refs/codebuff/agents/editor/editor.ts`
- `refs/codebuff/agents/thinker/thinker.ts`
- `refs/codebuff/agents/reviewer/code-reviewer.ts`
- `refs/codebuff/agents/context-pruner.ts`

## Architectural Character

Codebuff is the most explicitly **multi-agent orchestration-first** harness explored so far.

Its core idea is not hidden in docs; it is encoded directly in shipped agent definitions.

The main product behavior is driven by:

- a top-level orchestrator agent (`base2` family)
- specialized subagents for editing, thinking, reviewing, file exploration, research, terminal use
- a runtime that allows both prompt-driven steps and programmatic generator-based steps
- local tool execution through the SDK rather than server-side execution

This makes Codebuff distinct from:

- Pi: extension-first minimal kernel
- OpenCode: integrated client/server workflow platform
- OpenHarness: governance/orchestration-heavy Python harness

Codebuff feels closer to an **agent composition framework with a polished CLI**.

## AX: Agent Experience

## 1. The agent's world is template-driven

The runtime centers around agent templates, not one monolithic system prompt.

`mainPrompt()` resolves an agent type from:

- explicit agent ID, or
- cost mode (`free`, `normal`, `max`, `experimental`, `ask`)

The default practical mapping points toward the `base2` family.

This is important: the user is not really talking to one static assistant. They are talking to an orchestrator template whose behavior varies materially by mode.

## 2. Base agent behavior is deeply specified in `agents/base2/base2.ts`

The `base2` agent definition is one of the most revealing files in the repo.

It encodes:

- model choice
- provider routing
- tool access
- spawnable agents
- system prompt
- instructions prompt
- step prompt
- a programmatic `handleSteps()` loop

This means Codebuff's core behavior is partly prompt and partly runtime logic.

### Base2 worldview

The default orchestrator is instructed to:

- gather context before editing
- spawn mentioned agents if user uses `@AgentName`
- use researchers/file pickers before changing code
- use editor agent for non-trivial implementation
- use thinker for harder reasoning
- use reviewer after implementation
- write todos for multi-step tasks
- validate via typecheck/tests where appropriate
- ask user for key decisions when needed

This is one of the clearest examples so far of a product team operationalizing a preferred coding workflow directly into the harness.

## 3. Codebuff's agent loop is hybrid: LLM steps plus programmatic steps

This is one of Codebuff's most distinctive engineering ideas.

`loopAgentSteps()` does not merely run repeated LLM turns. It can also run a template's `handleSteps()` generator via `runProgrammaticStep()` before each LLM step.

So an agent may:

- yield tool calls directly
- yield `STEP`
- yield `STEP_ALL`
- request `GENERATE_N`
- emit text containing embedded tool calls
- set output programmatically

### Loop shape

```text
loopAgentSteps
  -> initialize run
  -> build initial message history
  -> build system prompt and tool set
  -> while not done
       -> optionally run handleSteps() generator
       -> maybe stop if generator ended turn
       -> runAgentStep() for LLM turn
       -> process tool calls and tool results
       -> repeat
  -> finish run and compute output
```

This is richer than a plain ReAct loop.

## 4. Programmatic agents are first-class, not an edge feature

`run-programmatic-step.ts` shows that generator-based agents are central to the architecture, not a plugin afterthought.

The runtime keeps per-run generator state in memory and lets a generator:

- run arbitrary sequences of tool calls
- interleave text with tool calls
- request multiple candidate completions
- explicitly end a turn
- set output for parent orchestration

This is a major AX strength because it lets agent authors blend:

- deterministic orchestration
- LLM reasoning
- local control flow

### Programmatic step model

```text
handleSteps generator
  -> yield tool call
  -> runtime executes tool
  -> send result back into generator
  -> yield more tools / STEP / STEP_ALL / GENERATE_N
  -> optionally set structured output
```

That is more expressive than most harnesses explored so far.

## 5. Specialized subagents are not generic abstractions; they are concrete workflows

Shipped agents include:

- `editor`
- `thinker`
- `code-reviewer`
- file pickers and researchers
- bashers
- `context-pruner`

These are purpose-built.

### Editor agent

The editor agent is especially interesting.

It:

- inherits parent conversation and system prompt
- is limited to edit tools and `set_output`
- is instructed not to read more files
- emits implementation as Codebuff tool-call text blocks

This is effectively a constrained implementation worker.

### Thinker agent

The thinker agent:

- has no tools
- inherits conversation history
- reasons in `<think>` tags
- returns structured output stripped of the think content

So it is a pure reasoning delegate.

### Reviewer agent

The reviewer agent:

- sees conversation context
- cannot modify code
- gives concise critical review only
- focuses on missing requirements, unnecessary complexity, style mismatches, dead code, etc.

So Codebuff's subagents are specialized roles with hard harness affordances, not just differently named prompts.

## 6. Local tools are part of the agent's effective environment

The runtime emits tool calls, but the SDK executes them locally.

That means the agent can rely on real local operations for:

- file reads
- file edits
- terminal commands
- code search
- globbing
- directory listing
- MCP tools
- custom user tools

Unlike a server-centric harness, Codebuff's effective agent environment is the user's machine.

This is a strong AX advantage for code editing authenticity, but it also increases trust and safety requirements.

## 7. Context is aggressively precomputed into SessionState

`run-state.ts` shows that the initial session state contains a lot more than chat history.

It can include:

- project file tree
- token scores for files/symbols
- knowledge files
- user home knowledge files
- custom/local agent templates
- custom tool definitions
- skills
- git status/diff/commit summaries
- system info

This means the agent starts with a cache-like structured project context instead of discovering everything from scratch on every run.

### SessionState structure concept

```text
SessionState
├─ mainAgentState
│  ├─ messageHistory
│  ├─ agentType
│  ├─ creditsUsed
│  ├─ directCreditsUsed
│  ├─ stepsRemaining
│  ├─ output
│  └─ agentContext
└─ fileContext
   ├─ projectRoot / cwd
   ├─ fileTree
   ├─ fileTokenScores
   ├─ tokenCallers
   ├─ knowledgeFiles
   ├─ userKnowledgeFiles
   ├─ agentTemplates
   ├─ customToolDefinitions
   ├─ skills
   ├─ gitChanges
   ├─ shellConfigFiles
   └─ systemInfo
```

That is a very agent-oriented state model.

## 8. Context pruning is unusually explicit and code-heavy

`agents/context-pruner.ts` is a full agent dedicated to context reduction.

The base orchestrator automatically spawns it before each step.

Notable behavior:

- removes agent-local prompt noise
- checks context size and prompt-cache miss conditions
- summarizes user, assistant, and tool history differently
- preserves latest image-bearing user context
- carries forward conversation summaries
- reapplies token budgets separately for user vs assistant/tool content
- writes back summarized messages using `set_messages`

This is one of the most distinctive AX features in Codebuff.

It is more agentified than Pi's or OpenCode's compaction: the pruning logic itself lives as a specialized agent definition with procedural logic.

## 9. Provider and model routing affect AX in real ways

`sdk/src/impl/llm.ts` shows a nuanced provider selection and fallback system:

- Claude OAuth direct if possible
- ChatGPT OAuth direct if possible
- Codebuff backend otherwise
- automatic fallback on OAuth rate limits or auth issues
- model/provider routing metadata passed into requests
- reasoning support configured via provider options

This means the agent experience is shaped not only by prompt and tooling but by dynamic provider path selection.

## 10. AX strengths

- strongest built-in specialized-agent strategy seen so far
- hybrid runtime supports both LLM reasoning and deterministic orchestration
- editor/thinker/reviewer split is concrete and effective
- rich SessionState gives the agent a good cached project model
- automatic context pruning is sophisticated and explicit
- local tool execution makes the coding environment real
- mode-specific orchestrators materially change behavior

## 11. AX weaknesses

- behavior is spread across many layers, so the agent model is harder to reason about holistically
- a lot of policy is prompt-driven rather than enforced by hard runtime constraints
- generator state is in-memory, which is elegant but less durable than persisted stateful runtimes
- reliance on many specialized agents can make behavior harder to predict than a smaller kernel

## UX: User Experience

## 1. The primary UX is a polished TUI

The CLI is a serious terminal app built with OpenTUI and React.

From `cli/src/index.tsx`, `app.tsx`, and `chat.tsx`, the UX includes:

- startup logo and project context
- chat history screen
- project picker screen
- login modal
- top banners and status bars
- rich input bar with modes and suggestions
- attachment handling
- active subagent / tool visualizations
- review and feedback flows

This is more app-like than most terminal harnesses.

## 2. The CLI is modeful in a very visible way

Users can start in modes like:

- DEFAULT
- MAX
- PLAN
- FREE

These are not cosmetic.

They map to different orchestration agents and cost modes. So the UX is tightly connected to harness behavior.

That is a strength: users get meaningful coarse-grained control without learning internal architecture.

## 3. The streaming UX is subagent-aware

The CLI doesn't just print one assistant stream. It tracks:

- root assistant chunks
- subagent chunks
- reasoning chunks
- tool call events
- tool results
- spawned agent placeholders
- completion states

This allows Codebuff to surface multi-agent work in a user-visible way.

### Streaming visualization model

```text
SDK events
├─ response-chunk
├─ subagent-response-chunk
├─ tool_call
├─ tool_result
├─ subagent_start
├─ subagent_finish
└─ finish

CLI
├─ root message stream
├─ nested agent blocks
├─ tool output blocks
├─ plan extraction blocks
└─ status/timer/queue indicators
```

Compared with simpler CLIs, this is a much richer explanation surface.

## 4. Queueing and interruption UX are taken seriously

The CLI has explicit handling for:

- waiting vs streaming states
- queue pausing/resuming/clearing
- Ctrl-C semantics
- abort propagation
- retry states
- reconnection / auth reachability states

This gives the terminal UX more resilience than a naïve REPL.

## 5. Attachments and shell context are integrated into normal interaction

`use-send-message.ts` and surrounding helpers show that user messages can include:

- text
- image attachments
- pasted long text attachments
- pending bash context/messages

That is a strong UX feature for coding tasks, because the harness can ingest more than raw prompt strings.

## 6. Project and conversation continuity UX is strong

The CLI supports:

- continuing previous chats
- loading most recent chat state
- resuming specific chat IDs
- persistent local run state storage
- project picker and recent project switching

This gives users a long-lived workflow rather than ephemeral sessions.

## 7. Validation and sensitive-file UX

Before sending, the CLI validates agents. And the run config blocks sensitive files via a file filter:

- env files
- key/cert/credential files
- SSH private keys
- terraform state and similar

That is good UX because it reduces accidental harmful reads without requiring the user to micromanage it.

## 8. UX strengths

- unusually polished TUI for a multi-agent harness
- meaningful mode system that maps to real behavior
- good visualization of nested agent work
- strong session continuation and project continuity
- solid interruption, queueing, and retry UX
- attachment and shell-context flows feel native to coding work

## 9. UX weaknesses

- the product surface is large and can feel busy
- multi-agent visualization may be harder for new users to mentally parse
- much of the real behavior depends on hidden orchestrator prompts rather than obvious UI labels
- local tool execution raises UX trust questions even if it improves power

## DX: Developer Experience

## 1. Codebuff is unusually hackable at the agent-definition level

This is a major DX differentiator.

Developers can define agents as data plus optional generator code.

Capabilities include:

- prompt-only templates
- `handleSteps` generator workflows
- explicit tool lists
- spawnable agent lists
- system/instructions/step prompts
- structured output schemas
- provider routing
- inherit-parent-system-prompt behavior

This is a very strong authoring model for custom orchestrations.

## 2. Local `.agents` and `.agents/skills` loading is built in

`sdk/src/agents/load-agents.ts` and `sdk/src/skills/load-skills.ts` support:

- loading local agents from `.agents` in cwd, parent, and home
- hot import-style loading of TS/JS modules
- MCP env var interpolation
- optional validation
- skill loading from `.claude/skills` and `.agents/skills`

This is a practical developer-facing extension story, even if it is less formalized than Pi's extension/package ecosystem.

## 3. The SDK is a real embedding surface

`CodebuffClient` gives a clean external entrypoint.

The SDK supports:

- custom agents
- custom tools
- prior run continuation
- project files / knowledge files injection
- custom skills directory
- file filters
- event streaming callbacks
- environment overrides

This is a strong DX surface for embedding Codebuff into other apps.

## 4. Runtime and tool boundaries are conceptually good

The architecture split in the docs is basically true in code:

- CLI handles rendering and local UX
- SDK handles local orchestration and tool plumbing
- agent-runtime handles agent loops and prompts
- agents package holds workflow definitions

That is a healthy separation conceptually.

## 5. But some important files are very large

Important large files include:

- `cli/src/chat.tsx` ~1525 lines
- `packages/agent-runtime/src/run-agent-step.ts` ~1124 lines
- `sdk/src/run.ts` ~864 lines
- `sdk/src/run-state.ts` ~740 lines
- `agents/context-pruner.ts` ~749 lines
- `cli/src/hooks/use-send-message.ts` ~551 lines
- `agents/base2/base2.ts` ~441 lines

So despite decent package boundaries, key implementation files are still very large.

## 6. Prompt-heavy policy is both a power and a cost

A lot of Codebuff's engineering lives in agent definitions rather than only runtime code.

That is good for experimentation, but it also means:

- core behavior is partly scattered across prompt files/agent definitions
- correctness depends heavily on authored instructions
- contributors need to understand prompt policy and runtime semantics together

## 7. Server/backend dependencies complicate full understanding

The SDK can route through direct OAuth or the Codebuff backend, and request flow depends on web APIs for:

- user identity
- chat completions
- token counting
- billing/credits
- agent run tracking

So a contributor often needs to understand both local runtime and hosted service assumptions.

## 8. DX strengths

- strong custom-agent authoring model
- good SDK surface for embedding
- clear local agent/skill loading path
- rich runtime semantics for advanced workflows
- good test coverage signals across CLI/SDK/runtime
- agent definitions are flexible enough to express real orchestration logic

## 9. DX weaknesses

- several core files are too large
- behavior is distributed across runtime, SDK, and agent templates
- many important guarantees are prompt-convention based rather than type/runtime enforced
- understanding the full stack requires following CLI -> SDK -> runtime -> agent template -> backend

## Context Window and Tool Calling Diagrams

## Message and context assembly

```text
initial session state
├─ project file tree
├─ token scores
├─ knowledge files
├─ user home knowledge files
├─ skills
├─ local agent templates
├─ custom tools
├─ git changes
└─ system info

per run
├─ previous message history
├─ user prompt
├─ attachments / images
├─ pending bash context
├─ mode-based agent selection
├─ system prompt from template
├─ instructions prompt
└─ step prompts on each loop iteration
```

## Local tool execution path

```text
LLM/runtime emits tool call
  -> agent-runtime processStream()
  -> SDK requestToolCall()
  -> local handler executes on user's machine
       ├─ read_files
       ├─ write_file / str_replace / apply_patch
       ├─ run_terminal_command
       ├─ code_search / glob / list_directory
       ├─ MCP tools
       └─ custom tools
  -> tool result returned to runtime
  -> next LLM step sees tool output
```

## Multi-agent orchestration path

```text
user prompt
  -> base2 orchestrator
  -> spawns specialists
       ├─ file-picker / researchers
       ├─ thinker
       ├─ editor
       ├─ reviewer
       ├─ basher
       └─ context-pruner
  -> CLI renders nested agent blocks
  -> orchestrator synthesizes final response
```

## Comparison Notes vs Pi and OpenCode

### Compared to Pi

- Codebuff is much more multi-agent-opinionated out of the box
- Pi is cleaner as a reusable runtime toolkit
- Codebuff's custom-agent story is stronger at the workflow-template level
- Pi's extension/package ecosystem is more platform-like; Codebuff's agent authoring is more orchestration-like

### Compared to OpenCode

- both are productized, but in different directions
- OpenCode is more client/server platform oriented with central control-plane state
- Codebuff is more agent-composition oriented with local execution emphasis
- OpenCode bakes workflow into runtime services; Codebuff bakes workflow into agent templates and generators

### Compared to OpenHarness

- Codebuff is much more focused on coding workflows and local editing ergonomics
- OpenHarness emphasizes governance and orchestration patterns broadly
- Codebuff's specialized-agent pattern is more explicit and operationalized

## Preliminary Non-Scored Assessment

### AX

Codebuff has one of the most distinctive AX designs so far.

Its signature strengths are:

- specialized built-in subagents
- hybrid programmatic + LLM runtime
- strong local coding environment access
- detailed precomputed project context
- automatic context pruning

The tradeoff is that behavior is distributed and prompt-policy heavy.

### UX

Codebuff delivers a polished terminal-first multi-agent experience. The main UX strength is making orchestration visible without requiring the user to manually manage it. Mode selection and nested agent rendering are standout features.

### DX

Codebuff is especially strong for developers who want to author custom agents and workflows. The SDK is solid, and the generator-based agent model is powerful. The main costs are file size, complexity, and dependence on a hosted backend for some flows.

## Final Takeaways

Codebuff is engineered around a very specific thesis:

- one general coding agent is not enough
- specialized agents produce better results
- orchestration should be a first-class product capability
- local execution is essential for authentic coding assistance

At the code level, that thesis is real.

Its strongest engineering traits are:

- explicit multi-agent architecture
- programmable agent workflows via generators
- strong SDK-mediated local tool execution
- rich session/project context initialization
- polished subagent-aware TUI
- sophisticated context-pruning strategy

Its main engineering drawback is complexity spread:

- some core behavior is in the runtime
- some is in the SDK
- some is in the CLI
- a lot is in agent definitions

That makes Codebuff powerful and distinctive, but harder to fully reason about than a smaller or more layered harness.