# Architecture Comparison: Skyth vs Reference Implementations

## Overview

This document provides a detailed architectural comparison between Skyth and three reference implementations: Legacy Skyth, Moltbot (formerly Clawdbot), and Skyth. Each system represents a different approach to building AI agent platforms.

---

## High-Level Comparison Matrix

| Aspect | Current Skyth | Legacy Skyth | Moltbot | Skyth |
|--------|---------------|--------------|---------|----------|
| **Primary Language** | Python | Python | TypeScript | TypeScript |
| **Runtime** | FastAPI + uvicorn | FastAPI + uvicorn | Node.js | Bun |
| **Frontend** | Next.js + Bun | Next.js | Svelte/HTML | SolidJS (TUI) |
| **Target Audience** | Platform Builders | Platform Builders | End Users | Developers |
| **Core Philosophy** | Extensible Agent Platform | Modular Discovery System | Personal AI Assistant | Coding Agent Tool |
| **Maturity** | Early Development | Prototype | Production-Ready | Production-Ready |
| **Primary Use Case** | Build custom agents | Build custom agents | Always-on assistant | Code assistance |

---

## Architectural Patterns

### Current Skyth

**Pattern:** Service-Oriented Monolith with Registry-Based Discovery

**Key Characteristics:**
- FastAPI application with auto-discovered routes (`*_route.py`)
- Database orchestrator pattern for multi-database fallback
- Registry-based component discovery (agents, tools, apps, pipelines)
- Absolute imports enforced across backend
- Hot-swappable modules via manifest-driven architecture

**Code Organization:**
```
backend/
├── base_classes/        # Abstract base classes
├── registries/          # Auto-discovery registries
├── agents/             # Self-contained agent modules
├── tools/              # Global tool implementations
├── pipelines/          # Tool chains
├── converters/         # Provider abstractions
└── services/           # Business logic layer
```

**Discovery Mechanism:**
- Routes: `*_route.py` files auto-discovered
- Tools: `*_tool.py` files auto-registered
- Agents: `agent_manifest.json` files located via recursive search

---

### Legacy Skyth (`refs/Skyth/`)

**Pattern:** LLM-Routed Modular Agent System

**Key Characteristics:**
- **Dynamic Router:** Uses LLM to semantically match user queries to agents
- **GenericAgent Fallback:** Agents without custom implementation use base class
- **Convention-based Discovery:** File naming conventions drive auto-registration
- **Provider Abstraction:** Unified interface using models.dev + LiteLLM

**Router Implementation:**
```python
class Router:
    @classmethod
    async def route(cls, query: str, history: Optional[List[dict]] = None):
        # Uses small model to select appropriate agent
        agents_map = AgentRegistry.list_agents()
        system_prompt = f"Select agent from: {agent_descriptions}"
        response = await generate_response(model_id="gpt-4o-mini", ...)
        return AgentRegistry.get_agent(selected_agent_name)
```

**Agent Discovery:**
```python
# backend/registries/agent_registry.py
class AgentRegistry:
    @classmethod
    def discover(cls, root_dir: str = "backend"):
        for file_path in scan_path.rglob("agent_manifest.json"):
            cls.register(str(file_path.resolve()))
```

**Strengths:**
- Intelligent agent selection via LLM reasoning
- Hot-swappable agent implementations
- Clean separation between manifest and implementation

**Weaknesses:**
- LLM routing adds latency
- Quasar (memory system) mostly stubbed (TBD)
- LGP (Logic Gate Protocol) not implemented

---

### Moltbot (`refs/moltbot/`)

**Pattern:** WebSocket Gateway Control Plane

**Key Characteristics:**
- **Central Gateway Server:** All communication flows through WebSocket hub
- **Multi-Channel Architecture:** Plugin-based channel integrations (WhatsApp, Discord, etc.)
- **Device Nodes:** Remote execution on iOS/Android/macOS devices
- **Session Persistence:** File-based storage with message parts

**Gateway Server Startup:**
```typescript
export async function startGatewayServer(
  port = 18789,
  opts: GatewayServerOptions = {}
): Promise<GatewayServer> {
  // Config validation and migration
  // Plugin registry loading
  // Channel manager creation
  // Node registry initialization
  // WebSocket handler attachment
  // Tailscale/discovery setup
  // Browser control, cron, heartbeat services
}
```

**Session Architecture:**
```typescript
// Session with parts-based message storage
export const Info = z.object({
  id: Identifier.schema("session"),
  projectID: z.string(),
  directory: z.string(),
  parentID: Identifier.schema("session").optional(),
  title: z.string(),
  time: z.object({
    created: z.number(),
    updated: z.number(),
  }),
})
```

**Communication Flow:**
```
Channel (WhatsApp) 
  → Gateway WebSocket 
  → Session Manager 
  → Agent Runtime 
  → Tool Execution 
  → Response Streaming 
  → Channel (WhatsApp)
```

**Strengths:**
- Production-ready infrastructure with health checks, monitoring, diagnostics
- Multi-device orchestration (exec on server, device actions on nodes)
- Real-time streaming with delta buffers
- Sophisticated DM pairing security model
- Comprehensive logging and telemetry

**Weaknesses:**
- Complex startup sequence (many services to coordinate)
- Heavy Node.js ecosystem dependency
- Tailscale-specific exposure logic

---

### Skyth (`refs/skyth/`)

**Pattern:** TUI-First Developer Tool with Hard-Coded Agents

**Key Characteristics:**
- **Built-in Agents:** Hard-coded `build`, `plan`, `general`, `explore`, `compaction` agents
- **Permission System:** Fine-grained bash command patterns, edit/webfetch controls
- **LSP Integration:** Language Server Protocol for code intelligence
- **Snapshot/Revert:** File-based snapshot system for undo functionality

**Agent Definition:**
```typescript
// src/agent/agent.ts
const result: Record<string, Info> = {
  build: {
    name: "build",
    tools: { ...defaultTools },
    permission: agentPermission,
    mode: "primary",
    native: true,
  },
  plan: {
    name: "plan",
    permission: planPermission, // edit: "deny", bash limited
    tools: { ...defaultTools },
    mode: "primary",
    native: true,
  },
  general: {
    name: "general",
    description: "General-purpose agent for complex multi-step tasks",
    mode: "subagent",
    native: true,
    hidden: true,
  },
}
```

**Permission Model:**
```typescript
const planPermission = {
  edit: "deny",
  bash: {
    "find *": "allow",
    "git diff*": "allow",
    "ls*": "allow",
    "grep*": "allow",
    "*": "ask",  // Everything else requires permission
  },
  webfetch: "allow",
}
```

**Tool Registry:**
```typescript
// src/tool/registry.ts
export async function tools(providerID: string) {
  return [
    InvalidTool,
    BashTool,
    ReadTool,
    GlobTool,
    GrepTool,
    EditTool,
    WriteTool,
    TaskTool,
    WebFetchTool,
    TodoWriteTool,
    TodoReadTool,
    WebSearchTool,
    CodeSearchTool,
    ...custom,  // Plugin tools
  ]
}
```

**Strengths:**
- Polished terminal UI experience
- LSP diagnostics and hover support
- Code-specific tools (lsp-diagnostics, lsp-hover, multiedit)
- Snapshot-based revert system
- Provider-agnostic (works with any model)
- Auto-sharing to Skyth cloud

**Weaknesses:**
- Agents are hard-coded (less extensible)
- TUI-centric (no web UI out of box)
- Limited to coding workflows

---

## Component-by-Component Comparison

### Agent Systems

#### Current Skyth
- **Discovery:** `agent_manifest.json` files
- **Base Class:** `BaseAgent` (abstract `run_task` method)
- **Execution:** Direct invocation via registry
- **Routing:** Manual or API-driven
- **Customization:** Agent-specific `AGENTS.md` + custom `agent.py`

#### Legacy Skyth
- **Discovery:** `agent_manifest.json` files
- **Base Class:** `BaseAgent` with `GenericAgent` fallback
- **Execution:** LLM-based routing via `Router.route()`
- **Routing:** Semantic matching using small model
- **Customization:** Optional custom `agent.py` overrides GenericAgent

#### Moltbot
- **Discovery:** Config-driven (agents.defaults in config)
- **Base Class:** No formal base class (functional approach)
- **Execution:** Session-based (channel → session → agent)
- **Routing:** Channel/account-based routing rules
- **Customization:** Workspace-specific skills and prompts

#### Skyth
- **Discovery:** Hard-coded in `agent/agent.ts`
- **Base Class:** `Agent.Info` interface
- **Execution:** User switches via Tab key or @mention
- **Routing:** Explicit user selection
- **Customization:** Config-driven overrides (temperature, model, prompt, tools)

---

### Tool Systems

#### Current Skyth
```python
class BaseTool(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass
    
    @abstractmethod
    async def run(self, input_data: Any) -> Any:
        pass
```
- **Pattern:** Class-based inheritance
- **Discovery:** `*_tool.py` convention
- **Registration:** Auto-scan by ToolRegistry
- **Dependency Injection:** Constructor-based

#### Legacy Skyth
- Same as Current Skyth (shared codebase)

#### Moltbot
```typescript
// Tools via Pi agent + Gateway methods
{
  "bash": { execute: (args) => ... },
  "canvas.snapshot": { execute: (args) => ... },
  "system.run": { execute: (args) => ... },
}
```
- **Pattern:** Function-based with schemas
- **Discovery:** Gateway methods + node capabilities
- **Registration:** Plugin registry
- **Context:** Gateway context injected

#### Skyth
```typescript
// src/tool/registry.ts
export const BashTool: Tool.Info = {
  id: "bash",
  init: async () => ({
    parameters: z.object({ command: z.string() }),
    description: "Execute bash commands",
    execute: async (args, ctx) => { ... }
  })
}
```
- **Pattern:** `Tool.Info` interface with init function
- **Discovery:** Hard-coded core + plugin scan
- **Registration:** Array concatenation
- **Permissions:** Agent-specific allow/deny/ask rules

---

### Memory & State Management

#### Current Skyth
- **Database:** Multi-database orchestrator (SQLite → MongoDB/Postgres fallback)
- **Memory System:** Quasar (planned, not implemented)
- **Event Logging:** Planned (immutable event log)
- **State:** Database-backed persistence

#### Legacy Skyth
- **Database:** Multi-database orchestrator
- **Memory System:** Quasar references mem0 implementation
- **Event Logging:** Stubbed (TBD)
- **State:** Database-backed persistence

#### Moltbot
- **Database:** File-based storage (no external DB)
- **Memory System:** Session message parts with full history
- **Event Logging:** Comprehensive event bus (agent.event, heartbeat, etc.)
- **State:** In-memory + file persistence
- **Storage Structure:**
  ```
  ["session", projectID, sessionID] → Session.Info
  ["message", sessionID, messageID] → MessageV2.Info
  ["part", messageID, partID] → MessageV2.Part
  ```

#### Skyth
- **Database:** File-based storage (SQLite-like)
- **Memory System:** Session-based with compaction
- **Event Logging:** BusEvent system with publishers/subscribers
- **State:** `Instance.state()` pattern for lazy-loaded state
- **Snapshot System:** Diff-based snapshot for revert functionality

---

### Provider & Model Management

#### Current Skyth
```python
class Provider:
    @staticmethod
    def get_model(model_str: str) -> Optional[Model]:
        # Resolves "openai/gpt-4o" to Model object
        # Fetches from models.dev API
        # Applies custom provider configs
        # Returns Model with API keys resolved
```
- Uses `models.dev` API for model metadata
- LiteLLM for multi-provider support
- Custom provider mappings (gemini-cli, qwen-code)
- Config-based API key resolution

#### Legacy Skyth
- Same provider system (shared codebase)
- Additional gemini-cli and qwen-code native clients

#### Moltbot
```typescript
// Uses Pi agent runtime (RPC mode)
// Model catalog loaded from disk/remote
export async function loadGatewayModelCatalog() {
  // Loads model definitions
  // Supports OAuth + API key auth
  // Failover logic built-in
}
```
- Model catalog with auth profiles
- OAuth support (Anthropic Pro/Max)
- Session-level model overrides
- Thinking level configuration

#### Skyth
```typescript
// Uses Vercel AI SDK + models.dev
export namespace Provider {
  export function getModel(providerID: string, modelID: string) {
    // Loads from models.dev
    // Applies provider-specific options
    // Returns language model instance
  }
}
```
- `models.dev` API integration
- Vercel AI SDK for streaming
- Provider-specific headers (anthropic-beta, etc.)
- Per-agent model configuration

---

### Communication Protocols

#### Current Skyth
- **Protocol:** HTTP/REST (FastAPI)
- **Streaming:** Planned (SSE or WebSocket)
- **Format:** JSON
- **Authentication:** Session-based (JWT planned)

#### Legacy Skyth
- **Protocol:** HTTP/REST (FastAPI)
- **Streaming:** Not implemented
- **Format:** JSON
- **Authentication:** Session-based

#### Moltbot
- **Protocol:** WebSocket (primary), HTTP (secondary)
- **Streaming:** Delta-based streaming with buffers
- **Format:** JSON-RPC style messages
- **Authentication:** Token + password auth, Tailscale identity headers
- **Methods:** 100+ gateway methods (chat.send, session.create, node.invoke, etc.)

#### Skyth
- **Protocol:** Local IPC (file-based), optional ACP (Agent Client Protocol)
- **Streaming:** Vercel AI SDK streaming
- **Format:** JSON
- **Authentication:** Local filesystem (no auth for local use)

---

## Key Insights & Recommendations

### What Current Skyth Should Adopt

#### From Legacy Skyth
1. **LLM-based Router** - Intelligent agent selection improves UX
2. **Provider Abstraction** - The models.dev + LiteLLM pattern is solid
3. **GenericAgent Fallback** - Manifest-only agents work without custom code

#### From Moltbot
1. **Event Bus Pattern** - Comprehensive pub/sub for agent events
2. **Session Parts Model** - Separate message info from content parts
3. **Node Registry** - Remote execution capabilities for distributed workloads
4. **Health/Heartbeat System** - Production-ready monitoring infrastructure
5. **Config Hot-Reload** - Live config updates without restart

#### From Skyth
1. **Permission System** - Fine-grained bash command patterns
2. **Agent Modes** - Primary vs subagent distinction
3. **Snapshot/Revert** - File-level undo functionality
4. **LSP Integration** - Code intelligence for development agents
5. **Plugin System** - User-defined tools in config directories

---

### What Current Skyth Should Avoid

#### From Legacy Skyth
- Don't leave Quasar/LGP as stubs - implement or remove
- Don't rely solely on LLM routing (add explicit routing options)

#### From Moltbot
- Don't build WebSocket-first unless needed (REST is simpler)
- Don't over-engineer startup (Moltbot has 30+ service initializations)
- Don't tie architecture to specific tools (Tailscale coupling)

#### From Skyth
- Don't hard-code agents (maintain manifest-based discovery)
- Don't limit to TUI (keep web UI as primary interface)
- Don't restrict to code-only use cases

---

## Architectural Decision Matrix

| Feature | Current Skyth | Recommended Approach | Source |
|---------|---------------|---------------------|--------|
| **Agent Discovery** | Manifest-based | Keep manifest + add dynamic routing | Legacy Skyth |
| **Tool System** | Class-based | Keep class-based + add plugin scan | Skyth |
| **Memory** | Database-backed | Add event bus + message parts | Moltbot |
| **Routing** | Manual | Add LLM router + explicit routing | Legacy Skyth |
| **Permissions** | Basic | Add fine-grained bash patterns | Skyth |
| **State Management** | Database only | Add session parts + snapshots | Moltbot + Skyth |
| **Communication** | HTTP/REST | Keep REST + add SSE streaming | Current |
| **Provider System** | models.dev + LiteLLM | Keep current approach | Legacy Skyth |
| **Config Management** | Static | Add hot-reload support | Moltbot |
| **Monitoring** | Basic logging | Add health checks + heartbeats | Moltbot |

---

## Implementation Priorities

### Phase 1 (Current Focus)
- [x] FastAPI application structure
- [x] Auto-route discovery
- [x] Database orchestrator
- [ ] Complete authentication system
- [ ] Agent registry implementation
- [ ] Tool registry implementation

### Phase 2 (Immediate Next)
- [ ] LLM-based router (from Legacy Skyth)
- [ ] Event bus system (from Moltbot)
- [ ] Session parts model (from Moltbot)
- [ ] Permission system (from Skyth)

### Phase 3 (Future)
- [ ] Quasar memory implementation
- [ ] LSP integration (from Skyth)
- [ ] Node registry for distributed execution
- [ ] Snapshot/revert system
- [ ] Plugin system for custom tools

---

## Conclusion

**Current Skyth** is positioned as a **platform for platform builders** - more extensible than Skyth, more focused than Moltbot, and more mature than Legacy Skyth.

**Key Differentiators:**
1. **Python Ecosystem** - Access to ML/AI libraries unavailable in TypeScript
2. **Manifest-Driven Architecture** - Agents/tools defined declaratively
3. **Database Flexibility** - Multi-database support with fallback mechanisms
4. **Web-First** - Next.js frontend for visual agent building (vs TUI)

**Success Criteria:**
- Easier to build custom agents than Legacy Skyth
- More flexible than Skyth's hard-coded agents
- Simpler deployment than Moltbot's multi-service architecture
- Better memory system than all three (when Quasar is implemented)

---

*Document generated: 2026-01-29*  
*Agent: Skyth (Antigravity)*  
*Last updated: Initial creation*
