# Architecture Overview

**Last Updated:** 2026-01-31  
**Status:** Comprehensive architecture defined across 6 phases

---

## Overview

Skyth is a **generalist AI agent platform** designed to get things done. Built on a modular, hot-swappable, and self-discoverable architecture, Skyth provides a unified backend serving multiple platforms (CLI, Web, Desktop, Mobile).

**Core Philosophy:** Extend, don't erase. Agents are collaborators with wide latitude within defined structures.

---

## High-Level Architecture

### Multi-Platform System

```
┌─────────────────────────────────────────────────────────┐
│                    User Interfaces                      │
├───────────┬──────────┬──────────┬──────────────────────┤
│    CLI    │   Web    │ Desktop  │      Mobile          │
│  (Bun/TS) │ (Next.js)│ (Tauri)  │    (Flutter)         │
└───────────┴──────────┴──────────┴──────────────────────┘
            │          │          │          │
            └──────────┴──────────┴──────────┘
                       │
    ┌──────────────────▼──────────────────┐
    │    Backend API (Bun/Hono)           │
    │  REST + SSE + WebSocket             │
    └──────────────────┬──────────────────┘
                       │
    ┌──────────────────▼──────────────────┐
    │      Agent System (Hybrid)          │
    │  Generalist + Specialists           │
    │  + Subagents                        │
    └──────────────────┬──────────────────┘
                       │
    ┌──────────────────▼──────────────────┐
    │   Quasar Memory System (5 Layers)   │
    │   + LGP (Logic Gate Protocol)       │
    └─────────────────────────────────────┘
```

**Development Approach:** CLI-first, with unified backend serving all platforms.

---

## Platform Architecture

### CLI (Primary Interface) - Phase 2

**Technology:** Bun runtime + TypeScript  
**Purpose:** Primary user interface for developers  
**Features:**

- Interactive TUI mode
- Non-interactive command mode
- WebSocket connection to backend
- Real-time streaming responses
- Agent switching UI

**Reference:** `@refs/apps/quickstar`

---

### Web (Visual Builder) - Phase 4

**Technology:** Next.js (App Router) + shadcn/ui  
**Purpose:** Visual agent builder (n8n-like workflow editor - deferred to Phase 6+)  
**Phase 4 Features:**

- Basic web interface for chat
- Agent selection and switching
- Session management
- Memory/history viewing
- Settings configuration

**Future (Phase 6+):**

- Visual workflow editor
- Drag-and-drop agent builder
- Tool pipeline designer
- Live testing

**Component System:** shadcn/ui (mandatory for all UI components)

---

### Desktop - Phase 5

**Technology:** Tauri (Rust + TypeScript)  
**Purpose:** Native desktop wrapper with OS integration  
**Features:**

- Embedded backend option
- Native OS integration
- System tray icon
- Offline mode
- Platform-specific installers

---

### Mobile - Phase 6+

**Technology:** Flutter (Dart)  
**Purpose:** Native iOS/Android access  
**Features:**

- Remote backend connection
- Push notifications
- Voice input
- Lightweight interface

---

## Backend Architecture

### Core Framework

**Stack:**

- **Bun (TypeScript):** High-performance JavaScript/TypeScript runtime
- **Hono:** Ultra-fast, lightweight web framework
- **SQLite (Bun native):** Integrated high-performance relational database
- **LiteLLM (JS/TS adapter):** Unified multi-provider LLM interface

**Design Principles:**

- Fully async (`async`/`await`)
- Modular, hot-swappable components
- Auto-discovery and registration
- Absolute imports only

---

### Communication Protocols

#### 1. REST API

**Purpose:** Standard operations (CRUD, config, auth)  
**Endpoints:**

```
/api/v1/auth/*      - Authentication
/api/v1/agents/*    - Agent management
/api/v1/sessions/*  - Session handling
/api/v1/memory/*    - Quasar memory access
```

#### 2. SSE (Server-Sent Events)

**Purpose:** One-way streaming (agent responses, progress)  
**Usage:** CLI streaming, web live updates

#### 3. WebSocket

**Purpose:** Bidirectional communication, interactive sessions  
**Usage:** Desktop app, real-time collaboration

**See:** `spec/phase-4/backend-api.md` for full specification

---

## Agent Architecture

### Hybrid Delegation Model (Phase 2)

Skyth uses a **3-tier hierarchy** with horizontal (peer-to-peer) and vertical (parent-child) delegation:

```
───────────────────────────────────────────────
                [GENERALIST]
                     |
          ───────────────────────
          |          |           |
         [A1]       [A2]        [A3]
         Code       Research    Data
         |                        |
        ─────                   [SA31]
        |   |
     [SA11] [SA12]
     Debug   Test
───────────────────────────────────────────────
```

**Tiers:**

1. **Generalist (Top):** Orchestrator, full context, all tools
2. **Specialized Agents (Horizontal):** Domain expertise (code, research, data)
3. **Subagents (Vertical):** Task-specific, disposable, minimal tools

**Key Features:**

- Agent-to-agent delegation via global `delegate` tool
- Agent-to-subagent spawning via `task` tool
- Circular call prevention (call stack tracking)
- Progress monitoring via `are_we_there_yet` tool
- Context passing: Full for agents, minimal for subagents

**See:** `spec/phase-2/agent-architecture.md` for complete specification

---

### Agent Characteristics

**Task-Focused:** Each agent designed for specific workflows  
**Sandboxed Workspaces:** Isolated execution environments  
**Self-Contained Resources:**

- Local tools (agent-specific)
- Global tools (shared)
- Pipelines (workflow chains)
- MCP servers (context protocol)
- Apps (UI widgets)

---

### Agent Configuration

**Manifest:** `backend/agents/{agent_name}/agent_manifest.json`

```json
{
  "name": "code_agent",
  "type": "specialized",
  "capabilities": ["code_generation", "debugging"],
  "tools": ["bash", "read", "edit", "write", "delegate", "task"],
  "subagents": ["debug", "test"],
  "model_preferences": {
    "primary": "anthropic/claude-sonnet-4"
  }
}
```

**Agent-Specific Rules:** Each agent can have its own `AGENTS.md` with additional constraints.

---

## Component Architecture

### Tools

**Location:**

- Global: `backend/tools/`
- Agent-specific: `backend/agents/{agent_name}/tools/`

**Characteristics:**

- Inherit from `BaseTool` class
- Auto-registered by tool registry
- Exposed as callable functions to agents
- Can be shared or agent-specific

**Global Delegation Tools:**

- `delegate(agent, task, context)` - Call peer agent
- `task(subagent, todo)` - Spawn subagent
- `are_we_there_yet(task_id)` - Check progress

---

### Pipelines

**Location:**

- Global: `backend/pipelines/`
- Agent-specific: `backend/agents/{agent_name}/pipelines/`

**Characteristics:**

- Inherit from `BasePipeline` class
- Sequential or conditional tool chains
- Event-driven execution
- Auto-registered

---

### Apps

**Location:**

- Global: `backend/apps/`
- Agent-specific: `backend/agents/{agent_name}/apps/`

**Characteristics:**

- Specialized tool sets with UI widgets
- Inherit from `BaseApp` class
- Frontend components in `platforms/web/components/widgets/`
- Examples: Music player, YouTube search, Wikipedia lookup

---

### MCP (Model Context Protocol)

**Location:**

- Global: `~/.skyth/config/mcp/`
- Agent-specific: `~/.skyth/agents/{agent_name}/config/mcp/`

**Purpose:** Standardized tool/model interaction protocol

**MCP-to-TOON Conversion (Phase 2):**

- Converts MCP tool **outputs** from JSON to TOON
- ~40% token reduction for structured data
- Tool inputs remain JSON (LLMs trained on JSON tool-calling)
- Fallback to JSON if conversion fails

**See:** `spec/phase-2/mcp-toon-converter.md`

---

## Memory System (Quasar)

**Location:** `quasar/` (separate Rust repository with Python bindings)

### 5-Layer Architecture (Phase 3)

**Layer 0: Canonical QuasarDB**

- Encrypted JSONL (AES-256)
- Ground truth, immutable
- Solars/Nebulas branching

**Layer 0.5: ChromaDB**

- Vector embeddings (default)
- Semantic search
- Local, file-based

**Layer 1: JSONL**

- Append-only logs
- Simple backup
- Human-readable

**Layer 2: SQLite**

- Relational queries
- Metadata storage
- Bun native

**Layer 3: PostgreSQL + pgvector** (Optional)

- Production semantic search
- Requires user setup
- Advanced queries

**Layer 4: Redis** (Deferred to Phase 7)

- Session cache ("Hippocampus")
- High-performance lookups

**Implementation:** Rust core with Maturin Python bindings for performance

**See:** `spec/phase-3/quasar-architecture.md`

---

### Event System & Branching

**Event Types:**

- **Quasar Events:** All ticks (system, user, AI responses)
- **Solars:** User edits (create branch, restore filesystem)
- **Nebulas:** Regenerations (deactivate previous, restore filesystem)

**UUID-based Naming:**

- Root: `quasar-{uuid}`
- Solar: `solar-{uuid}` or `solar-{uuid}+n` (child branches)
- Nebula: `nebula-{uuid}` or `nebula-{uuid}+n`

**Filesystem Restoration:**

- Solars/Nebulas restore filesystem state to that tick
- All changes after that tick undone
- Enables "time travel" through conversation history

**See:** `spec/phase-3/event-types-branching.md`

---

### Quasar Tools (Phase 3)

1. **`quasar_search`** - Vector search across conversations
2. **`quasar_add`** - Add facts to permanent memory
3. **`quasar_subtract`** - Remove facts from memory
4. **`quasar_entitize`** - Create entity relationship graphs (LightRAG-inspired)
5. **`quasar_compress`** - Compress context via summarization
6. **`quasar_think`** - Scratchpad for non-reasoning models only

**Memory Categories:**

- User/agent-defined categories
- Max 7 categories by default
- > 7 requires superuser password (prevents context fragmentation)

**See:** `spec/phase-3/quasar-tools.md`

---

### Memory Storage Structure

```
~/.skyth/quasar/
├── md/
│   ├── daily/
│   │   └── January/
│   │       ├── 1st/          # Week 1
│   │       │   ├── day1.md
│   │       │   └── day2.md
│   │       ├── 2nd/          # Week 2
│   │       └── extras/
│   └── session/
│       ├── {session_uuid}.md
│       └── ...
├── db/
│   ├── layer0/               # Encrypted canonical
│   ├── chroma/               # ChromaDB
│   ├── layer1/               # JSONL logs
│   └── layer2.sqlite         # SQLite
└── layers.txt                # Enabled layers (e.g., "0 0.5 1 2")
```

**Context Injection:**

- New session: Last day's summary + last session summary
- Continuing session: Last day's summary (refreshed daily)

**See:** `spec/phase-3/session-vs-daily-storage.md`

---

## LGP (Logic Gate Protocol)

**Location:** Implemented in backend converters  
**Phase:** 3

### Purpose

Tool chaining and orchestration using logic gate operators.

### Syntax

**Logic Gates:** AND, OR, XOR  
**Operators:** PIPE, TO

**Example:**

```
{fetch_location} AND PIPE hotels in {location} AND PIPE {hotel_info} TO cost_calculator
```

**Execution:**

1. Tools called by name (no detailed specs in chain)
2. Tool outputs in TOON format (token efficiency)
3. Errors passed to LLM for decision (retry/modify/abort)
4. Uses Nushell (`nu -c`) for structured data handling

**See:** `spec/phase-3/lgp-specification.md`

---

## Data Layer

### Initial Development (Phase 3)

- **ChromaDB:** Vector embeddings
- **SQLite:** Relational metadata
- **JSONL:** Immutable logs

### Production (Optional)

- **PostgreSQL + pgvector:** Advanced semantic search
- **Redis:** Session caching (Phase 7)

### Write Strategy

**Parallel writes** to all enabled layers simultaneously (minimize latency)

### Read Strategy

**Cascading reads** from highest layer first (L3 → L2 → L1 → L0.5 → L0)

### Agent Interface

Agents use **Quasar Context Assembler (CTX)** - do NOT query databases directly

**See:** `spec/phase-3/chroma-sql-integration.md`

---

## Registries (Auto-Discovery)

**Location:** `backend/registries/`

**Registry Types:**

- **Agent Registry:** `agent_registry.ts`
- **Tool Registry:** `tool_registry.ts`
- **App Registry:** `app_registry.ts`
- **Pipeline Registry:** `pipeline_registry.ts`

**Functionality:**

- Automatic scanning at startup
- Component registration
- Hot-swappable architecture
- No manual registration needed

---

## Security & Watcher Mode

### Tiered Security Model (Phase 5)

**Levels:**

1. **Paranoid:** Approve ALL commands
2. **Standard (Default):** Approve dangerous/mutating commands
3. **Trust/Dev:** No approval (VPS/isolated environments)

**Dangerous Command Detection:**

- Pattern matching (`rm -rf`, `sudo`, etc.)
- Optional: LLM semantic analysis
- Whitelist/blacklist patterns

**Approval Flow:**

- CLI prompts with superuser password
- Web UI confirmation dialogs
- Timeout handling

**See:** `spec/phase-5/host-execution-security.md`

---

### Watcher Mode (Phase 5)

**Triggers:**

- File system changes (inotify/FSEvents)
- Time-based (cron schedules)
- External events (webhooks)

**Modes:**

- **Detached (Default):** Triggered processes, no daemon
- **Daemon (Optional):** Continuous background service

**See:** `spec/phase-5/watcher-mode.md`

---

## Epsilon Version Control

**Purpose:** State-based version control for AI interactions  
**Phase:** 5

**Features:**

- Filesystem state snapshots at every Quasar tick
- Time-travel to any conversation point
- Integration with Solars/Nebulas
- Automatic restoration on branch switching

**Storage:** `.skyth/epsilon/` (project-specific)

**See:** `spec/phase-5/epsilon.md`

---

## Repository Structure

### Monorepo Organization (Phase 4)

```
Skyth/
├── justfile                    # Primary developer interface
├── turbo.json                  # TypeScript task orchestration
│
├── core/
│   └── backend/                # Bun Hono (TypeScript)
│       ├── package.json
│       ├── tools/              # Mandated spec folder
│       ├── agents/             # Mandated spec folder
│       ├── pipelines/          # Mandated spec folder
│       ├── converters/         # Mandated spec folder
│       ├── apps/               # Mandated spec folder
│       ├── registries/         # Mandated spec folder
│       └── internal/           # Core engine logic (encapsulated)
│
├── platforms/
│   ├── shared/                 # Shared TypeScript types
│   ├── cli/                    # Standalone CLI package (platforms/cli)
│   ├── web/                    # Next.js
│   ├── desktop/                # Tauri
│   └── mobile/                 # Flutter
│
├── spec/                       # Phase-wise specifications
│   ├── phase-1/
│   ├── phase-2/
│   └── ...
│
└── refs/                       # Reference implementations
    ├── apps/
    ├── libs/
    └── phase/
```

**External Repositories:**

- **Quasar:** Separate Rust repo with Python bindings
- **SUR (Skyth User Repository):** Community agents/tools marketplace

**See:** `spec/phase-4/platform-structure.md`

---

## Key Architectural Decisions

### AD1: Hybrid Router + Generalist (A2.1)

- **Decision:** Support both modes
- **Default:** Generalist (simpler, autonomous)
- **Optional:** Router model for agent selection
- **Configured in:** `~/.skyth/config/config.yml`

### AD2: Agent Nesting Strategy (A2.2)

- **Decision:** 2-level max (Agent → Subagent)
- **Circular Prevention:** Call stack tracking
- **Context:** Full for agents, minimal for subagents

### AD3: MCP Output Conversion Only (A2.3)

- **Decision:** Convert outputs to TOON, inputs stay JSON
- **Rationale:** LLMs trained on JSON tool-calling
- **Savings:** ~40% fewer tokens

### AD4: Quasar in Rust (A3.2)

- **Decision:** Rust core with Python bindings (Maturin)
- **Rationale:** Performance, memory safety, encryption
- **Distribution:** Pre-built wheels

### AD5: Monorepo with Just + Turborepo (A4.1)

- **Decision:** Just for all languages, Turborepo for TS
- **Rationale:** Polyglot codebase needs specialized tooling

---

## Embedding Models

**Configurable during onboarding:**

**Local (Default):**

- **TaylorAI/gte-tiny** - Lightweight, quality embeddings
- **all-MiniLM-L6-v2** - Alternative
- Sentence Transformers library

**Cloud (Optional):**

- OpenAI embeddings
- Google Gen AI embeddings
- Via user's API keys

**Note:** Can skip embeddings if not needed

---

## Key Principles

1. **Modularity:** Every component independently swappable
2. **Self-Discovery:** Automatic registration of components
3. **Flexibility:** Cloud and local execution support
4. **Graceful Degradation:** Fallback mechanisms for all dependencies
5. **Agent Autonomy:** Sandboxed with configurable capabilities
6. **Phase-Driven Development:** Incremental, tested progression
7. **CLI-First:** Primary interface is terminal, others build on backend

---

## Maturity Statement

This architecture is **production-focused and well-defined** across 6 phases:

**Advantages over reference implementations:**

- Enhanced modularity and extensibility
- Comprehensive memory system (Quasar)
- Multi-platform support from ground up
- Robust agent delegation model
- Token-efficient communication (TOON)
- Security-first design
- Comprehensive specification documentation

---

## Phase Roadmap

1. **Phase 1 (Weeks 1-5):** Onboarding & Authentication - 60% complete
2. **Phase 2 (Weeks 6-12):** Agent Architecture + CLI
3. **Phase 3 (Weeks 13-20):** LGP + Quasar Memory
4. **Phase 4 (Weeks 21-25):** Multi-Platform Frontends
5. **Phase 5 (Weeks 26-35):** Watcher + Security + Desktop
6. **Phase 6+ (Week 36+):** Visual Builder + Mobile + Advanced Features

**See:** `spec/plan.md` for detailed roadmap

---

## References

**Mandatory Reading:**

- `spec/plan.md` - Project roadmap
- `spec/PHASE_INDEX.md` - Phase navigation
- `spec/components.md` - Component standards
- `spec/agents/answers/2026-01-29.md` - Architectural Q&A (source of truth)

**Phase Specifications:**

- Phase 1: `spec/phase-1/README.md`
- Phase 2: `spec/phase-2/README.md`
- Phase 3: `spec/phase-3/README.md`
- Phase 4: `spec/phase-4/README.md`
- Phase 5: `spec/phase-5/README.md`
- Phase 6+: `spec/phase-6/README.md`

**Reference Implementations:**

- OpenClaw (Moltbot): `@refs/apps/openclaw`
- Nanobot: `@refs/apps/nanobot`
- Quickstar: `@refs/apps/quickstar`
- LightRAG: `@refs/libs/LightRAG`

---

_Last Updated: 2026-01-31_  
_Architecture Version: 1.0 (Phase-wise organization complete)_
