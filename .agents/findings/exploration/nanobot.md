# Nanobot Harness Exploration

## Scope

This document explores `refs/nanobot` as an AI agent harness at the code level, with emphasis on:

1. AX: agent experience
2. UX: user experience
3. DX: developer experience

This is an exploration document, not a ranking. Ranking should wait until the other harnesses are reviewed.

## What Nanobot Is

Nanobot is a Python-first agent harness built around a small core loop, a message bus, pluggable channels, provider adapters, a tool registry, session persistence, and a two-stage memory system.

The main runtime pieces are:

- CLI entrypoints in `refs/nanobot/nanobot/cli/commands.py`
- core agent loop in `refs/nanobot/nanobot/agent/loop.py`
- shared LLM execution loop in `refs/nanobot/nanobot/agent/runner.py`
- context construction in `refs/nanobot/nanobot/agent/context.py`
- tool abstraction in `refs/nanobot/nanobot/agent/tools/`
- provider abstraction in `refs/nanobot/nanobot/providers/`
- channel runtime in `refs/nanobot/nanobot/channels/`
- session persistence in `refs/nanobot/nanobot/session/manager.py`
- memory pipeline in `refs/nanobot/nanobot/agent/memory.py`
- OpenAI-compatible facade in `refs/nanobot/nanobot/api/server.py`

A useful line-count snapshot from the repo script:

- core runtime: 4659 lines
- tools: 3218 lines
- cli: 2592 lines
- channels: 10664 lines

So Nanobot is not tiny overall, but it is compact relative to larger harnesses and keeps the core loop conceptually narrow.

## Architectural Summary

```text
User
  |
  +-- CLI `nanobot agent`
  +-- Chat platform via `nanobot gateway`
  +-- OpenAI-compatible API via `nanobot serve`
           |
           v
      MessageBus
     /          \
Inbound        Outbound
   |              |
   v              v
AgentLoop ---- ChannelManager
   |
   +-- ContextBuilder
   +-- SessionManager
   +-- ToolRegistry
   +-- AgentRunner
   +-- Consolidator / Dream
   +-- SubagentManager
   +-- MCP connections
   |
   v
Provider adapter
   |
   v
LLM
```

## AX: Agent Experience

### 1. What the agent actually sees

The agent prompt is assembled by `ContextBuilder.build_messages()` in `refs/nanobot/nanobot/agent/context.py`.

The effective message stack is:

```text
[system]
  identity.md
  + platform policy
  + workspace path
  + execution rules
  + format hint based on channel
  + bootstrap files from workspace:
      AGENTS.md
      SOUL.md
      USER.md
      TOOLS.md
  + long-term memory from memory/MEMORY.md
  + always-on skills content
  + skill summary XML block
  + recent consolidated history from memory/history.jsonl

[history]
  unconsolidated session messages from SessionManager
  aligned to a legal tool-call boundary

[current user message]
  prepended with runtime metadata block:
    Current Time
    Channel
    Chat ID
  then the actual user content
  optionally multimodal blocks for images
```

Important implementation detail: runtime metadata is injected into the user message, not the system prompt. Nanobot labels this block as untrusted metadata with `ContextBuilder._RUNTIME_CONTEXT_TAG`, which is a deliberate anti-prompt-injection move.

### 2. Context window structure

A practical diagram of the prompt layout:

```text
system
├─ identity.md
├─ platform_policy.md
├─ workspace bootstrap files
│  ├─ AGENTS.md
│  ├─ SOUL.md
│  ├─ USER.md
│  └─ TOOLS.md
├─ memory/MEMORY.md
├─ always-on skill bodies
├─ skills summary XML
└─ recent history summaries from memory/history.jsonl

conversation history
├─ prior user/assistant/tool messages
└─ trimmed to legal boundaries by Session.get_history()

current turn
└─ user message
   ├─ runtime metadata block
   │  ├─ Current Time
   │  ├─ Channel
   │  └─ Chat ID
   └─ actual user content or multimodal blocks
```

### 3. How tool calling actually works

Tool definitions are produced by `ToolRegistry.get_definitions()` in `refs/nanobot/nanobot/agent/tools/registry.py`.

Each tool is a subclass of `Tool` from `refs/nanobot/nanobot/agent/tools/base.py` and exposes:

- `name`
- `description`
- `parameters` as JSON Schema
- `execute()`

The LLM-facing tool schema is OpenAI-style:

```json
{
  "type": "function",
  "function": {
    "name": "read_file",
    "description": "...",
    "parameters": {"type": "object", "properties": {...}}
  }
}
```

The tool-call loop is implemented in `AgentRunner.run()` in `refs/nanobot/nanobot/agent/runner.py`:

```text
build messages
  -> call provider
  -> if tool calls returned
       append assistant tool_call message
       validate and cast params via ToolRegistry.prepare_call()
       execute tool(s)
       append tool results
       continue loop
  -> else finalize assistant text and return
```

Specific strengths of this implementation:

- schema-driven casting and validation before execution
- tool execution can be concurrent when tools are marked `concurrency_safe`
- tool result truncation and persistence safeguards
- recovery logic for orphaned tool results and interrupted calls
- checkpointing of in-flight turns into session metadata

### 4. How providers translate tool calls

Provider abstraction lives in `refs/nanobot/nanobot/providers/base.py`.

Actual parsing for OpenAI-compatible models is in `refs/nanobot/nanobot/providers/openai_compat_provider.py`.

Nanobot normalizes provider output into:

- `LLMResponse`
- `ToolCallRequest`

That means the core loop does not care whether the model came from OpenAI-compatible APIs, Anthropic, Azure OpenAI, Codex OAuth, or GitHub Copilot OAuth. The provider adapter absorbs protocol differences.

This is a good harness property: the agent sees a unified tool-calling model even if the backend API changes.

### 5. What tools the agent gets by default

Registered in `AgentLoop._register_default_tools()` in `refs/nanobot/nanobot/agent/loop.py`:

- filesystem: `read_file`, `write_file`, `edit_file`, `list_dir`
- search: `glob`, `grep`
- shell: `exec`
- web: `web_search`, `web_fetch`
- messaging: `message`
- delegation: `spawn`
- scheduling: `cron` when configured
- external tools: MCP tools after `_connect_mcp()`

Notable design decisions:

- `exec` is optional and safety-guarded
- tools can be globally restricted to the workspace
- read access can include builtin skills even when workspace restrictions are enabled
- MCP tools are merged into the same registry, so they appear native to the model

### 6. Tool safety model

The safety model is simple but real.

Filesystem tools:

- resolve paths relative to the workspace
- can restrict access to an allowed directory
- reject paths outside allowed scope

Shell tool (`refs/nanobot/nanobot/agent/tools/shell.py`):

- regex-based denylist for destructive commands
- optional allowlist mode
- blocks internal/private URLs using `security/network.py`
- blocks path traversal when workspace restriction is active
- can run under a sandbox wrapper such as `bwrap`
- passes only a minimal environment by default

This is not a full capability isolation system, but it is clearly more than prompt-only safety.

### 7. Memory from the agent's point of view

Nanobot uses two memory layers:

1. session memory in `Session.messages`
2. long-term memory pipeline in `agent/memory.py`

Operationally:

- active conversation lives in session JSONL files
- older safe slices are summarized by `Consolidator` into `memory/history.jsonl`
- `Dream` periodically reads history and edits durable files:
  - `SOUL.md`
  - `USER.md`
  - `memory/MEMORY.md`

This is important for AX because the agent does not just receive raw conversation history forever. It receives:

- a bounded live session
- curated history summaries
- durable long-term files that become part of the system prompt

That gives Nanobot a more structured memory shape than a flat rolling transcript.

### 8. Session model

Sessions are keyed by `channel:chat_id` by default through `InboundMessage.session_key` in `refs/nanobot/nanobot/bus/events.py`.

There is also a `unified_session` mode in config that collapses multiple channels into `unified:default` inside `AgentLoop`.

Implementation details that matter:

- each session persists to workspace `sessions/*.jsonl`
- sessions maintain metadata and last consolidation pointers
- history is aligned to legal tool-call boundaries before reuse
- unfinished turns can be restored from runtime checkpoints after interruption

This is a strong harness behavior because it reduces session corruption after crashes or restarts.

### 9. Streaming model

Streaming is first-class in the loop.

`AgentLoop._dispatch()` emits outbound messages tagged with metadata such as:

- `_stream_delta`
- `_stream_end`
- `_streamed`
- `_stream_id`
- `_progress`
- `_tool_hint`

`ChannelManager` coalesces adjacent deltas for the same target before delivery.

This means the agent experience includes a distinction between:

- live text deltas
- progress text
- tool hint text
- final completion text

That is a more nuanced runtime than simple request/response.

### 10. Delegation and subagents

Nanobot includes a background delegation path via `spawn`.

The `SpawnTool` calls `SubagentManager.spawn()`, which launches a separate `AgentRunner` with a reduced tool set and then reports back by injecting a synthetic system message into the main agent loop.

Important limits:

- subagents do not get `message` or nested `spawn`
- subagents cap at `max_iterations=15`
- result announcement returns into the parent session as a system-originated event

This is lighter than a full multi-agent hierarchy, but it is a real harness-level delegation feature.

### 11. AX strengths

- very readable core loop
- structured prompt assembly instead of one giant ad hoc prompt
- unified provider abstraction
- explicit tool schemas and validation
- runtime checkpoints for interrupted tool turns
- streaming, progress, and tool-hint channels are separate concepts
- session and memory model are more thoughtful than average lightweight agents

### 12. AX weaknesses

- prompt assembly still depends heavily on raw markdown files rather than stronger typed prompt contracts
- many runtime behaviors are encoded through metadata flags on generic bus messages
- tool safety is practical but heuristic, especially for shell execution
- context governance is spread across `ContextBuilder`, `SessionManager`, and `AgentRunner`, which makes the full mental model less obvious
- several core files are large, especially `agent/loop.py`, `agent/runner.py`, and provider/channel implementations

## UX: User Experience

### 1. Main user entry points

Nanobot exposes three main surfaces:

1. CLI chat via `nanobot agent`
2. chat apps via `nanobot gateway`
3. OpenAI-compatible HTTP facade via `nanobot serve`

This is a good product decision because one harness can serve as:

- a local coding assistant
- a messaging-platform bot
- a backend agent service

### 2. CLI UX

CLI behavior is implemented in `refs/nanobot/nanobot/cli/commands.py`.

Notable UX details:

- interactive mode uses `prompt_toolkit`
- persistent history is stored via `SafeFileHistory`
- streamed output is rendered incrementally
- restart notices can be shown after runtime restarts
- single-shot mode and interactive mode both exist

The CLI is more polished than a basic REPL wrapper.

### 3. Onboarding UX

The main setup path is:

```text
nanobot onboard
  -> create or refresh config
  -> optional wizard mode
  -> create workspace
  -> sync workspace templates
  -> auto-inject default config for discovered channels
```

That is implemented in `onboard()` and `_onboard_plugins()`.

The UX value here is that plugin channels become part of onboarding automatically if they are discoverable.

### 4. Chat platform UX

Channels inherit from `BaseChannel` and forward inbound messages through `_handle_message()`.

From the user's point of view, Nanobot supports:

- direct message style interactions
- group-policy-aware messaging in some channels
- optional streaming replies if the channel implements `send_delta()`
- file and media support
- voice transcription on supported channels
- QR-based login for channels such as WhatsApp and Weixin

The harness is opinionated about channels as first-class citizens, not side integrations.

### 5. Response delivery UX

Outbound delivery goes through `ChannelManager._send_with_retry()`.

UX-relevant behavior:

- failed sends retry with exponential backoff
- progress and tool hints can be turned on or off globally
- streaming deltas are coalesced to reduce chatter and API load
- channels can decline streaming and still function in final-message mode

That gives users multiple levels of verbosity without changing the core agent.

### 6. Slash-command style UX

The loop checks built-in command routing before normal LLM execution. This gives users deterministic command behavior for operational commands rather than asking the model to improvise them.

The memory docs show commands like:

- `/dream`
- `/dream-log`
- `/dream-restore`

This is a useful harness-level UX distinction: some operations are not left to natural-language inference.

### 7. API UX

`refs/nanobot/nanobot/api/server.py` exposes `/v1/chat/completions`, `/v1/models`, and `/health`.

Important reality check: this API is only partially OpenAI-compatible.

Current constraints:

- only one user message per request
- `stream=true` is not supported
- all requests route through a persistent internal session
- optional `session_id` maps to `api:{session_id}`

So the API UX is good enough for simple integrations, but it is not a full drop-in replacement for richer OpenAI chat APIs.

### 8. UX strengths

- broad interaction surface: CLI, chat apps, API
- onboarding path is relatively straightforward
- channel login and status commands are built in
- streaming can feel responsive in channels that support it
- deterministic operational commands exist alongside natural-language interaction
- persistent sessions make interactions feel continuous

### 9. UX weaknesses

- configuration still lives in a large JSON file, which is not ideal for non-technical users
- API compatibility is intentionally narrow
- behavior can vary significantly by channel, especially for formatting and streaming
- many powerful features are discoverable mainly through README/docs rather than in-product guidance
- the richness of the system can make simple use cases feel more operational than necessary

## DX: Developer Experience

### 1. Core extensibility points

Nanobot offers several genuine extension seams.

#### Providers

Provider matching is centralized in config plus provider registry logic.

Developer path for a new provider is relatively light:

- add a `ProviderSpec` in provider registry
- add a config field in `ProvidersConfig`
- implement adapter behavior if needed

This is better than hardcoded if/else routing everywhere.

#### Channels

Channel plugins are discovered from:

- built-in package scanning
- Python entry points under `nanobot.channels`

This is implemented in `refs/nanobot/nanobot/channels/registry.py`.

The plugin guide is unusually concrete and practical. It explains:

- the packaging shape
- entry point registration
- config model requirements
- streaming hooks
- `default_config()` behavior

This is strong DX.

#### Tools

Tools are plain classes with JSON Schema parameters and an `execute()` method. The pattern is easy to copy.

This is one of Nanobot's best DX properties: tools are simple enough that both humans and coding agents can author them quickly.

#### Skills

Skills are markdown files discovered from workspace or builtin directories, summarized into XML, and lazily loaded by reading `SKILL.md` files.

This makes lightweight capability extension very accessible.

#### MCP

MCP servers are merged into the same tool registry. That gives developers an off-the-shelf extension mechanism without writing native Nanobot tools.

### 2. Code organization quality

The architecture itself is sensible:

- bus
- agent loop
- providers
- tools
- channels
- sessions
- memory
- cli

That is a good decomposition for a harness.

However, code size is becoming a DX issue. Several files are very large:

- `cli/commands.py` about 1405 lines
- `channels/feishu.py` about 1719 lines
- `channels/weixin.py` about 1380 lines
- `agent/loop.py` about 751 lines
- `agent/runner.py` about 761 lines
- `providers/openai_compat_provider.py` about 939 lines

So the architecture is modular in namespace terms, but not always in file-level maintainability terms.

### 3. Test posture

The repo has a substantial test suite covering:

- agent loop behavior
- channels
- tools
- providers
- config
- cron
- security
- API

That is a meaningful DX advantage because extension work has a test surface to land against.

### 4. Config model DX

Config is Pydantic-based in `refs/nanobot/nanobot/config/schema.py`.

Positive DX traits:

- camelCase and snake_case both accepted
- typed nested config objects
- permissive channel config through `ChannelsConfig(extra="allow")`
- workspace path is normalized through a property
- provider auto-matching is centralized

This is a good compromise between type safety and plugin flexibility.

### 5. DX for coding agents

Nanobot is friendly to AI coding agents for several reasons:

- tool implementations are small and patterned
- channel/plugin/provider registration points are explicit
- prompt templates are plain markdown files
- the bus model is easy to trace
- session and memory data are file-based and inspectable
- docs are practical and aligned with code

It is easy for an automated coding agent to answer questions like:

- where do I add a tool?
- how do I add a channel?
- how are tool schemas defined?
- how does session persistence work?

That is a strong DX signal.

### 6. DX weaknesses

- some critical behavior is distributed across many files, especially around context shaping and retries
- several implementation files are too large for fast comprehension
- the README is expansive, but code-level architecture docs are thinner than the product docs
- plugin systems are good, but registry/manifest conventions are lighter than in more formal harnesses
- channel implementations appear to carry a lot of platform-specific logic directly in single files

## Detailed Runtime Walkthrough

### Message path: CLI

```text
User runs `nanobot agent`
  -> CLI creates MessageBus, provider, AgentLoop
  -> if single message: call `process_direct()`
  -> if interactive: publish InboundMessage onto bus
  -> AgentLoop consumes inbound
  -> session selected
  -> commands checked
  -> context built
  -> AgentRunner runs model/tool loop
  -> outbound messages published
  -> CLI renderer prints stream/progress/final text
```

### Message path: gateway channel

```text
User sends message on Telegram/Discord/etc.
  -> channel SDK callback receives platform event
  -> BaseChannel._handle_message()
  -> MessageBus.publish_inbound()
  -> AgentLoop.run()
  -> AgentLoop._process_message()
  -> AgentRunner.run()
  -> MessageBus.publish_outbound()
  -> ChannelManager dispatches send/send_delta
  -> platform receives reply
```

### Message path: API

```text
Client POST /v1/chat/completions
  -> aiohttp handler validates body
  -> request lock per session
  -> `agent_loop.process_direct()`
  -> normalize response text
  -> return simple OpenAI-style JSON envelope
```

## Concrete Harness Takeaways

### Where Nanobot is engineered well

- The core loop is real harness engineering, not just prompting.
- The bus cleanly decouples channels from agent execution.
- Tool calling is schema-based and provider-normalized.
- Session persistence and interrupted-turn recovery are carefully handled.
- Memory is layered and operational, not just a transcript dump.
- Channels and providers are legitimate extension systems.

### Where Nanobot is still lightweight rather than rigorous

- Safety controls are pragmatic but not deeply sandboxed by default.
- API compatibility is shallow.
- Registry/manifest systems are less formal than enterprise-style harnesses.
- Some subsystem boundaries are clear conceptually but blurred by oversized files.

## Preliminary Non-Scored Assessment

### AX

Nanobot gives the agent a solid operating environment:

- structured prompt context
- usable tools
- memory layers
- streaming hooks
- subagents
- retries and checkpoints

This is a strong AX foundation for a relatively compact harness.

### UX

Nanobot has broad user surface area and practical onboarding, with particularly strong chat-platform support. The UX is best for technical users and operators rather than general consumers.

### DX

Nanobot is notably extensible and approachable for developers and coding agents, especially for tools, channels, and provider work. The main DX drag is file bloat in several key modules.

## Source References

Key files read for this exploration:

- `refs/nanobot/nanobot/cli/commands.py`
- `refs/nanobot/nanobot/agent/loop.py`
- `refs/nanobot/nanobot/agent/runner.py`
- `refs/nanobot/nanobot/agent/context.py`
- `refs/nanobot/nanobot/agent/memory.py`
- `refs/nanobot/nanobot/agent/subagent.py`
- `refs/nanobot/nanobot/agent/tools/base.py`
- `refs/nanobot/nanobot/agent/tools/registry.py`
- `refs/nanobot/nanobot/agent/tools/filesystem.py`
- `refs/nanobot/nanobot/agent/tools/shell.py`
- `refs/nanobot/nanobot/agent/tools/message.py`
- `refs/nanobot/nanobot/providers/base.py`
- `refs/nanobot/nanobot/providers/openai_compat_provider.py`
- `refs/nanobot/nanobot/channels/base.py`
- `refs/nanobot/nanobot/channels/manager.py`
- `refs/nanobot/nanobot/channels/registry.py`
- `refs/nanobot/nanobot/session/manager.py`
- `refs/nanobot/nanobot/config/schema.py`
- `refs/nanobot/nanobot/api/server.py`
- `refs/nanobot/nanobot/agent/skills.py`
- `refs/nanobot/docs/CHANNEL_PLUGIN_GUIDE.md`
- `refs/nanobot/docs/MEMORY.md`
