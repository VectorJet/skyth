# Legacy Skyth Python Harness Exploration

## Scope

This document explores `legacy(py)` as an AI agent harness at the code level, with emphasis on:

1. AX: agent experience
2. UX: user experience
3. DX: developer experience

This is an exploration document, not a ranking.

## What Legacy Skyth Python Is

Legacy Skyth Python is a FastAPI-based backend plus a Next.js frontend that together implement an agent chat product with:

- route auto-discovery from `legacy(py)/routes/`
- registry-based discovery for agents, tools, pipelines, and apps under `legacy(py)/backend/`
- an LLM router that picks a specialized agent before answering
- a more capable `Master Agent` that can run native tools, native pipelines, and discovered MCP tools
- SQLite chat persistence in `legacy(py)/chat_memory.db`
- optional vector memory through `mem0` and local Qdrant storage
- app-style widgets and connected-app state exposed to the frontend

The main runtime pieces are:

- API bootstrap in `legacy(py)/main.py`
- chat transport and SSE streaming in `legacy(py)/routes/chat_route.py`
- agent routing in `legacy(py)/backend/router.py`
- agent discovery in `legacy(py)/backend/registries/agent_registry.py`
- master tool loop in `legacy(py)/backend/agents/master_agent/agent.py`
- provider abstraction in `legacy(py)/backend/converters/provider.py`
- tool and pipeline discovery in `legacy(py)/backend/registries/tool_registry.py` and `legacy(py)/backend/registries/pipeline_registry.py`
- MCP discovery and execution in `legacy(py)/backend/managers/mcp_manager/mcp_manager.py`
- long-term memory adapter in `legacy(py)/backend/memory/memory_manager.py`
- frontend chat state and SSE parsing in `legacy(py)/frontend/hooks/use-chat.ts`

Representative file sizes:

- `legacy(py)/backend/converters/provider.py`: 469 LOC
- `legacy(py)/frontend/hooks/use-chat.ts`: 364 LOC
- `legacy(py)/routes/chat_route.py`: 227 LOC
- `legacy(py)/backend/agents/master_agent/agent.py`: 190 LOC
- `legacy(py)/backend/managers/mcp_manager/mcp_manager.py`: 186 LOC

This harness is medium-sized overall but structurally uneven: several extension systems are present, yet the actual end-to-end chat path is still fairly direct and ad hoc.

## Architectural Summary

```text
User
  |
  +-- Next.js chat UI
  |     |
  |     +-- useChat hook
  |     +-- POST /api/search
  |     +-- GET /api/chats
  |     +-- GET /api/chats/{id}/history
  |
  v
FastAPI app
  |
  +-- route auto-discovery from routes/*_route.py
  |
  +-- /api/search
        |
        +-- persist user message to SQLite
        +-- load prior session history
        +-- Router.route(query, history)
               |
               +-- AgentRegistry.discover()
               +-- small-model LLM chooses agent name
        |
        +-- selected agent.run_task(...)
               |
               +-- GenericAgent: plain completion
               +-- MasterAgent: tool loop
               +-- BrowserAgent: MCP browser loop
        |
        +-- stream SSE events to frontend
        +-- persist assistant response to SQLite
```

The design is registry-driven in several places, but the runtime still centers on a single chat route rather than a dedicated orchestrator or session runtime object.

## AX: Agent Experience

### 1. What the agent actually sees

There is no single shared context-builder. Context is assembled inside whichever runtime path is active.

For routing:

- `Router.route()` in `legacy(py)/backend/router.py` builds a routing-only system prompt containing the available agent names and descriptions
- recent history is truncated to the last four user/assistant messages
- the router model is the configured `small_model` when available

For generic agents:

- `GenericAgent.run_task()` in `legacy(py)/backend/registries/agent_registry.py` uses the agent-local `AGENTS.md` contents as the full system prompt
- prior history is appended directly
- the new task is appended as a user message

For `Master Agent`:

- conversation is just `history + current user task`
- `self.instructions` from `backend/agents/master_agent/AGENTS.md` is passed as the system prompt
- available tools are injected as OpenAI-style tool definitions

For `Browser Agent`:

- the code inserts a system message directly into the message list instead of using the `system=` argument
- history is appended after that system message
- browser MCP tools are exposed as function tools

This means the prompt structure is not globally standardized. The effective context depends on which agent the router picked.

### 2. Context window structure

A practical view of the normal chat flow looks like this:

```text
router call
├─ system: agent selection prompt
├─ recent user/assistant history
└─ current user query

selected agent call
├─ system: agent-local AGENTS.md instructions
├─ full session history from SQLite
└─ current user query
```

Notable consequences:

- no shared runtime metadata block for channel, workspace, or timestamps
- no legal tool-boundary trimming
- no central bootstrap of root `AGENTS.md`, user profile, or memory summaries into the agent prompt
- prompt quality varies by how much effort an individual agent implementation put into setup

### 3. How tool calling actually works

Tool calling exists, but only in specific paths.

`MasterAgent` in `legacy(py)/backend/agents/master_agent/agent.py` does the main native loop:

```text
discover native tools
discover native pipelines
read cached MCP tools
convert all components to OpenAI tool schemas
call provider with conversation + tools
if tool calls returned:
  execute each tool
  append tool results
  loop again
else:
  return assistant content
```

Execution order in `_execute_tool()` is:

1. native tool via `ToolRegistry`
2. native pipeline via `PipelineRegistry`
3. MCP tool via `MCPManager`

This is a solid layering choice because it lets one agent present all extensibility domains through one tool interface.

Limits of the implementation:

- no argument validation beyond `json.loads()`
- no permission model per tool
- no retry, checkpoint, or compensation logic
- streaming tool-call accumulation is incomplete and marked as simplified
- `MCPManager.get_openai_tools()` depends on a cache, but `MasterAgent` never calls `discover_tools()` itself

That last point means MCP tools may appear conceptually supported but be absent unless some other runtime path populated the cache earlier.

### 4. Registry-driven discovery

Legacy Skyth Python already has the core shape of the registry architecture the current repo wants:

- agents discovered from `agent_manifest.json`
- apps discovered from `app_manifest.json`
- tools discovered from `*_tool.py`
- pipelines discovered from `*_pipeline.py`
- MCP servers discovered from JSON config files

The good part is that extensibility is file-system driven rather than hard-coded.

The weak part is that manifests are minimal and weakly validated:

- agent manifests contain only fields like `agent_name`, `description`, `global_capabilities`, `version`
- app manifests are similarly lightweight
- there is no schema validation, duplicate detection, deterministic conflict resolution, or actionable diagnostics beyond `print()`

So the project has registry shape, but not yet registry rigor.

### 5. Delegation and specialization model

The system uses selection rather than hierarchical delegation.

Current behavior:

- the chat route asks the router LLM to choose an agent
- the chosen agent handles the task
- there is no bounded subagent tree, circular-call prevention, or explicit agent handoff protocol

In practice:

- `Generalist Agent` usually falls back to `GenericAgent` because there is no custom `agent.py` in its folder
- `Master Agent` is the main orchestration-capable implementation
- `Browser Agent` is a specialist for Playwright MCP

This is useful specialization, but it is not yet a robust delegation framework.

### 6. Memory from the agent's point of view

There are two separate memory stories:

1. actual chat history persisted in SQLite
2. optional vector memory through `mem0`

Operationally, the active chat experience depends on SQLite:

- user and assistant messages are stored in the `messages` table
- history is loaded per `session_id`
- the full ordered history is sent back into agent calls

`mem0` integration in `legacy(py)/backend/memory/memory_manager.py` is more of an optional side system:

- singleton wrapper around `mem0`
- local Qdrant path under `~/.skyth/memory_store`
- Gemini embeddings used when `GEMINI_API_KEY` exists and `OPENAI_API_KEY` does not

What is missing:

- no evidence in the main chat path that retrieved memories are injected into prompts
- no summarization or consolidation loop
- no event-sourced memory log
- no per-agent or per-session memory policy

So the agent effectively experiences SQLite transcript replay, not a mature long-term memory system.

### 7. MCP from the agent's point of view

MCP is treated as an extension transport rather than a core runtime abstraction.

`MCPManager`:

- discovers server configs from global and agent-local JSON files
- creates stdio client sessions
- can list tools and call tools
- can convert cached tools into OpenAI-compatible definitions

This gives the harness real MCP reach, but with important caveats:

- tool discovery is expensive and not clearly scheduled
- cached tools are global mutable state
- no namespacing when multiple servers expose the same tool name
- failure handling is print-based and best-effort

`BrowserAgent` is the clearest successful MCP use case because it owns one specific server and runs a dedicated loop against it.

## UX: User Experience

### 1. Main interaction surface

The primary user surface is the Next.js chat app under `legacy(py)/frontend/`.

Important pieces:

- `frontend/app/page.tsx` renders the chat screen
- `frontend/components/chat.tsx` manages the visible message stream, scrolling, inline regeneration, and branch loading
- `frontend/hooks/use-chat.ts` owns chat list state, current history, live streaming message state, attachments, and request submission

The UX model is chat-first, not CLI-first.

### 2. Streaming behavior

The backend streams SSE events from `/api/search`.

Frontend event types handled in `use-chat.ts` include:

- `answer_chunk`
- `thought`
- `tool_call`
- `tool_result`
- `agent_call`
- `artifacts`
- `chat_title_generated`

The route currently emits:

- `thought`
- `answer_chunk`
- `artifacts`
- `error`
- `[DONE]`

This mismatch is revealing. The frontend expects a richer structured stream than the current backend reliably provides. The UI architecture is ahead of the present backend implementation.

### 3. Session and history model

Chat sessions are simple:

- `POST /api/chats` creates a UUID-backed chat shell
- messages are grouped by `session_id`
- `GET /api/chats` infers chat list entries by aggregating the `messages` table
- `GET /api/chats/{session_id}/history` returns the ordered messages

This gives users persistent history with minimal infrastructure, but there are limitations:

- no explicit chat metadata table
- chat titles are effectively session IDs until something richer is built
- branch/version fields exist in the frontend model, but the backend history route does not implement real branching

The frontend clearly wants editable and regenerable branches, but the backend only partially supports that model.

### 4. Multimodal and app/widget UX

The frontend supports:

- file attachments
- image modal behavior
- app widgets and artifact rendering
- connected app state

The current backend chat route accepts uploaded files, but the files are not meaningfully processed in the main route. That makes attachment UX more scaffolded than complete.

Apps are exposed through `routes/app_route.py` and `AppRegistry`, with connection state stored in SQLite. This gives the product a plugin-app flavor, especially for YouTube, Spotify, Music, and Wikipedia.

The important UX point is that Legacy Skyth was aiming for more than plain text chat. It was moving toward a mixed chat-plus-widget interface.

### 5. Authentication and user model

There is a real auth/service layer:

- registration and login endpoints
- JWT generation and validation
- profile reads and updates
- connected apps tied to user IDs

That said, some comments still describe the setup as migration/demo quality, and authorization checks are incomplete in places such as profile updates.

UX implication: this was trying to be a multi-user app, not just a local harness, but some security-hardening work was unfinished.

## DX: Developer Experience

### 1. What is good for developers

Several ideas are strong:

- clear foldered backend domains: `agents/`, `tools/`, `pipelines/`, `apps/`, `registries/`, `converters/`
- filesystem-based auto-discovery keeps extension points easy to understand
- base classes make the architecture legible
- MCP support is integrated at the platform layer, not bolted onto one route
- provider abstraction centralizes model compatibility logic

For a developer exploring the codebase, the mental model is understandable after reading a modest number of files.

### 2. What is hard for developers

The codebase has several maintainability issues:

- pervasive `sys.path.append(...)` path surgery
- absolute-path intentions in comments, but no real package discipline
- dynamic imports with limited validation
- print-based diagnostics instead of structured logging
- multiple partially overlapping generations: `legacy(py)/backend`, `legacy(py)/skyth-old/backend`, and placeholder `quasar/` and `LGP/`
- some frontend state models assume features the backend does not yet implement

This creates a repo that is understandable in slices but not strongly coherent end to end.

### 3. Provider/model abstraction quality

`backend/converters/provider.py` is both useful and overloaded.

Strengths:

- models.dev ingestion and caching
- provider normalization
- config loading from `config.yml`
- LiteLLM dispatch
- provider-specific transforms for Gemini, Qwen, Mistral, Anthropic, and OpenAI-compatible backends

Weaknesses:

- 469 LOC in one file
- mixed responsibilities: config loading, provider cataloging, model resolution, transformation, and execution transport
- direct network dependency on `https://models.dev/api.json`

This file is one of the clearest candidates for modular splitting if the legacy code were revived.

### 4. Test posture

There is a test directory, but the tests look more like execution probes than a hardened automated suite.

Examples:

- `tests/test_cli_flow.py` prints pass/fail messages rather than using strong assertions throughout
- `tests/test_memory.py` depends on external memory and embedding setup

This suggests developer intent to probe behavior, but not yet a mature CI-safe contract suite.

### 5. Security and operational concerns

There are several notable issues from a DX and platform perspective:

- `config/mcp_config/global_mcp.json` contains what appears to be a plaintext GitHub personal access token
- CORS is fully open in `main.py`
- MCP server config points the filesystem server at `/home/tammy/tests`, not the project workspace
- manifest and config validation are weak
- some profile/auth routes note missing production-grade authorization checks

This matters because the harness is not only extensible, it is also exposed to remote models, remote APIs, and local tools. Weak operational discipline becomes architecture debt quickly.

## Key Takeaways

### What Legacy Skyth Python gets right

- It already thinks in registries and manifests.
- It separates agents, tools, pipelines, apps, and provider adapters into recognizable layers.
- It has a credible chat product shape, not just an agent loop demo.
- It integrates MCP early enough that browser automation and external tool transport are real parts of the design.

### What it does only partially

- tool safety
- manifest rigor
- shared context construction
- durable memory injection
- streaming event consistency
- branching/versioned conversation support
- delegation safety controls

### What is most reusable for the current Skyth direction

- registry-based discovery layout
- base class structure for tools, apps, pipelines, and agents
- provider normalization ideas in `backend/converters/provider.py`
- MCP config discovery pattern
- app/widget concept for rich responses

### What should not be copied forward as-is

- plaintext secrets in config
- `sys.path` manipulation as import strategy
- print-led error handling
- weak manifest contracts
- route-level orchestration as the only real runtime coordinator
- feature assumptions in the frontend that are not guaranteed by backend contracts

## Suggested Follow-Up Reads

If this legacy harness is being mined for architecture, the next most valuable files are:

- `legacy(py)/backend/services/auth_service.py`
- `legacy(py)/backend/services/app_service.py`
- `legacy(py)/backend/pipelines/stock_pipeline.py`
- `legacy(py)/backend/tools/*.py`
- `legacy(py)/frontend/components/chat-message.tsx`
- `legacy(py)/frontend/components/widgets/`
- `legacy(py)/skyth-old/backend/` for comparison against the pre-migration generation

## Bottom Line

Legacy Skyth Python is best understood as a transitional full-stack agent product: more ambitious than a simple harness, but not yet consolidated into a disciplined runtime architecture.

Its strongest contribution to modern Skyth is not any single agent loop. It is the combination of:

- registry-first extensibility
- specialized agents plus a master orchestrator
- MCP-aware tool integration
- app/widget-oriented UX

Its main weakness is that these ideas are present in parallel, but not yet unified by a strict runtime contract, validated manifests, or a coherent safety model.
