# Technical Specifications

**Last Updated:** 2026-01-31  
**Status:** Phase-wise specifications complete  
**Organization:** See `spec/PHASE_INDEX.md` for navigation

---

## Overview

This document provides an index to all technical specifications for the Skyth platform. Detailed specifications are organized by implementation phase in their respective directories.

---

## Specification Organization

### Phase-Based Structure

All technical specifications are organized into phases, with each phase having its own directory containing detailed spec files:

```
spec/
├── PHASE_INDEX.md          # Master navigation guide
├── arch.md                 # Architecture overview (this is the MANDATORY READ)
├── plan.md                 # Project roadmap
├── spec.md                 # This file (index)
├── components.md           # Component standards
├── version_information.md  # Version history
│
├── phase-1/                # Onboarding & Authentication
├── phase-2/                # Agent Architecture
├── phase-3/                # LGP + Quasar
├── phase-4/                # Multi-Platform
├── phase-5/                # Watcher + Security
└── phase-6/                # Future Enhancements
```

**Navigation:** See `spec/PHASE_INDEX.md` for complete index and navigation.

---

## Core Specifications

### Architecture Specifications

**File:** `spec/arch.md` (MANDATORY READ)

**Contains:**

- High-level architecture overview
- Multi-platform system design
- Backend architecture (Bun Hono, TypeScript)
- Agent architecture (generalist + specialists + subagents)
- Memory system (Quasar 5-layer)
- LGP (Logic Gate Protocol)
- Data layer design
- Component architecture
- MCP integration
- Key architectural decisions

---

### Project Roadmap

**File:** `spec/plan.md`

**Contains:**

- Phase-by-phase development plan
- Timeline estimates (Weeks 1-35+)
- Deliverables per phase
- Success criteria
- Progress tracking
- Version strategy

---

### Component Standards

**File:** `spec/components.md`

**Contains:**

- Backend component standards
- Status indicators (NO EMOJIS)
- Visual feedback patterns
- Tool/Pipeline/App/Agent standards

---

### Version Information

**File:** `spec/version_information.md`

**Contains:**

- Current version
- Semantic versioning strategy
- Changelog format
- Release history (as releases are made)

---

## Phase-Specific Specifications

### Phase 1: Onboarding & Authentication

**Directory:** `spec/phase-1/`  
**Status:** 60% Complete  
**Timeline:** Weeks 1-5

**Specifications:**

1. **onboarding.md** - Interactive/non-interactive onboarding flows
2. **config-schema.md** - Complete config.yml specification
3. **authentication.md** - Argon2id hashing, API keys, sessions
4. **completion-checklist.md** - Implementation tasks and testing
5. **messaging-apps.md** - Optional Telegram/WhatsApp integration

**Key Topics:**

- User onboarding wizard (TUI + CLI flags)
- Config file schema (`~/.skyth/config/config.yml`)
- Password hashing (Argon2id)
- API key management
- Session tracking (UUID-based)
- OAuth support
- Model validation (models.dev API)

**See:** `spec/phase-1/README.md`

---

### Phase 2: Modular Agent Architecture

**Directory:** `spec/phase-2/`  
**Status:** Specification Complete  
**Timeline:** Weeks 6-12

**Specifications:**

1. **README.md** - Phase overview and goals
2. **agent-architecture.md** - Generalist + specialists + subagents
3. **router-vs-generalist.md** - Routing strategies (TBD - create as needed)
4. **mcp-toon-converter.md** - MCP-to-TOON conversion (TBD - create as needed)
5. **cli-interface.md** - Bun/TypeScript CLI (TBD - create as needed)
6. **platform-priority.md** - Development priorities (TBD - create as needed)

**Key Topics:**

- Hybrid agent architecture (router + generalist)
- Agent delegation (horizontal: agent-to-agent, vertical: agent-to-subagent)
- Global tools (`delegate`, `task`, `are_we_there_yet`)
- Circular call prevention
- MCP-to-TOON converter (~40% token reduction)
- TypeScript CLI (Bun runtime)
- FastAPI backend
- WebSocket communication

**See:** `spec/phase-2/README.md`

---

### Phase 3: LGP + Quasar

**Directory:** `spec/phase-3/`  
**Status:** Specification Complete  
**Timeline:** Weeks 13-20

**Specifications:**

1. **README.md** - Phase overview and goals
2. **lgp-specification.md** - Logic Gate Protocol (TBD - create as needed)
3. **quasar-architecture.md** - 5-layer memory system (TBD - create as needed)
4. **session-vs-daily-storage.md** - Storage strategies (TBD - create as needed)
5. **event-types-branching.md** - Solars/Nebulas (TBD - create as needed)
6. **quasar-tools.md** - 5 core tools + 60 CLI commands (TBD - create as needed)
7. **chroma-sql-integration.md** - Database integration (TBD - create as needed)

**Key Topics:**

- Logic Gate Protocol (AND, OR, XOR, PIPE, TO)
- Quasar 5-layer architecture (L0-L4)
- Event system (Quasar, Solar, Nebula)
- UUID-based branching
- Filesystem restoration
- ChromaDB + SQLite integration
- Rust core with Python bindings (Maturin)
- Embedding models (gte-tiny)
- Background processing
- 60+ CLI commands

**See:** `spec/phase-3/README.md`

---

### Phase 4: Multi-Platform Frontends

**Directory:** `spec/phase-4/`  
**Status:** Specification Complete  
**Timeline:** Weeks 21-25

**Specifications:**

1. **README.md** - Phase overview and goals
2. **platform-structure.md** - Repository restructure (TBD - create as needed)
3. **backend-api.md** - REST + SSE + WebSocket (TBD - create as needed)
4. **web-ui.md** - Next.js web interface (TBD - create as needed)
5. **desktop-app.md** - Tauri desktop (deferred to Phase 5)

**Key Topics:**

- Repository restructure (core/ + platforms/)
- Multi-protocol backend (REST, SSE, WebSocket)
- Next.js web interface (basic chat, no visual builder yet)
- Multiple authentication methods (JWT, session, API key)
- Monorepo management (Just + Turborepo)
- Shared TypeScript types (platforms/shared/)

**See:** `spec/phase-4/README.md`

---

### Phase 5: Watcher Mode & Advanced Features

**Directory:** `spec/phase-5/`  
**Status:** Specification Complete  
**Timeline:** Weeks 26-35

**Specifications:**

1. **README.md** - Phase overview and goals
2. **watcher-mode.md** - File/time/webhook triggers (TBD - create as needed)
3. **background-processing.md** - Detached/daemon modes (TBD - create as needed)
4. **host-execution-security.md** - Tiered security model (TBD - create as needed)
5. **epsilon.md** - State-based version control (TBD - create as needed)

**Key Topics:**

- Watcher mode (continuous monitoring)
- Security tiers (Paranoid, Standard, Trust)
- Command approval flow
- Dangerous command detection
- Epsilon version control (time-travel)
- Tauri desktop application
- Background processing (session-end, daily aggregation)
- Daemon vs detached modes

**See:** `spec/phase-5/README.md`

---

### Phase 6+: Future Enhancements

**Directory:** `spec/phase-6/`  
**Status:** Planning  
**Timeline:** Week 36+

**Specifications:**

1. **README.md** - Future features and roadmap

**Potential Features:**

- Visual agent builder (n8n-like)
- Mobile application (Flutter)
- Agent marketplace (SUR)
- Advanced memory features (Layer 4: Redis)
- Collaborative features (multi-user)
- Platform expansion (Discord, Slack, VS Code)

**See:** `spec/phase-6/README.md`

---

## API Specifications

### Backend API (Phase 4)

**Protocols:**

- **REST API:** Standard operations (CRUD, config, auth)
- **SSE (Server-Sent Events):** One-way streaming
- **WebSocket:** Bidirectional communication

**Base URL:** `http://localhost:8000/api/v1`

**Endpoints:**

```
Authentication:
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh

Agents:
GET    /agents
POST   /agents/{agent_id}/execute
GET    /agents/{agent_id}/status

Sessions:
GET    /sessions
POST   /sessions
GET    /sessions/{session_id}

Memory (Quasar):
GET    /memory/search
POST   /memory/add
GET    /memory/timeline
```

**Detailed Spec:** `spec/phase-4/backend-api.md` (TBD - create as needed)

---

## Database Schemas

### Quasar 5-Layer Architecture (Phase 3)

**Layer 0:** Canonical QuasarDB

- Format: Encrypted JSONL (AES-256)
- Purpose: Ground truth, immutable
- Storage: `~/.skyth/quasar/db/layer0/`

**Layer 0.5:** ChromaDB

- Format: Vector embeddings
- Purpose: Semantic search (default)
- Storage: `~/.skyth/quasar/db/chroma/`

**Layer 1:** JSONL Logs

- Format: Append-only JSONL
- Purpose: Simple backup, human-readable
- Storage: `~/.skyth/quasar/db/layer1/`

**Layer 2:** SQLite

- Format: Relational database
- Purpose: Metadata queries
- Storage: `~/.skyth/quasar/db/layer2.sqlite`

**Layer 3:** PostgreSQL + pgvector (Optional)

- Format: Relational + vector
- Purpose: Production semantic search
- Requires: User setup

**Layer 4:** Redis (Deferred to Phase 7)

- Format: Key-value cache
- Purpose: Session cache ("Hippocampus")

**Detailed Spec:** `spec/phase-3/quasar-architecture.md` (TBD - create as needed)

---

## Agent Protocol Specifications

### Agent Manifest Schema (Phase 2)

**File:** `backend/agents/{agent_name}/agent_manifest.json`

**Schema:**

```json
{
  "name": "string",
  "display_name": "string",
  "description": "string",
  "version": "string",
  "type": "generalist|specialized",
  "capabilities": ["array", "of", "strings"],
  "tools": ["array", "of", "tool", "names"],
  "subagents": ["array", "of", "subagent", "names"],
  "max_context_tokens": "number",
  "model_preferences": {
    "primary": "provider/model",
    "fallback": "provider/model"
  }
}
```

**Detailed Spec:** `spec/phase-2/agent-architecture.md`

---

## Tool Interface Specifications

### BaseTool (Phase 2)

**Location:** `backend/base_classes/base_tool.py`

**Interface:**

```python
class BaseTool:
    name: str
    description: str
    parameters: dict

    async def execute(self, **kwargs) -> Any:
        """Execute tool with parameters"""
        pass
```

**Global Delegation Tools:**

- `delegate(agent, task, context)` - Call peer agent
- `task(subagent, todo)` - Spawn subagent
- `are_we_there_yet(task_id)` - Check progress

---

## Pipeline Execution Specifications

### BasePipeline (Phase 2-3)

**Location:** `backend/base_classes/base_pipeline.py`

**Types:**

- Sequential: Tools execute in order
- Conditional: Branch based on results
- LGP: Logic Gate Protocol chains

**LGP Example:**

```
{fetch_location} AND PIPE hotels in {location} AND PIPE {hotel_info} TO cost_calculator
```

**Detailed Spec:** `spec/phase-3/lgp-specification.md` (TBD - create as needed)

---

## App Manifest Schema

### BaseApp (Phase 2)

**Location:** `backend/base_classes/base_app.py`

**Characteristics:**

- Specialized tool sets
- UI widgets (frontend components)
- Auto-registered by app registry

**Examples:**

- Music player
- YouTube search
- Wikipedia lookup

---

## MCP Configuration Schema

### MCP Config (Phase 2)

**Location:**

- Global: `~/.skyth/config/mcp/mcp_config.json`
- Agent-specific: `~/.skyth/agents/{agent_name}/config/mcp/mcp_config.json`

**MCP-to-TOON Conversion:**

- Converts tool **outputs** from JSON to TOON
- ~40% token reduction
- Tool inputs remain JSON (LLMs trained on this)
- Fallback to JSON on failure

**Detailed Spec:** `spec/phase-2/mcp-toon-converter.md` (TBD - create as needed)

---

## LGP Protocol Specification

### Logic Gate Protocol (Phase 3)

**Operators:**

- **Logic Gates:** AND, OR, XOR
- **Flow Operators:** PIPE, TO

**Execution:**

- Tool chaining
- Error handling (pass to LLM for decision)
- Nushell (`nu -c`) for structured data

**Example:**

```
{search_docs} PIPE {summarize} TO {quasar_add}
```

**Detailed Spec:** `spec/phase-3/lgp-specification.md` (TBD - create as needed)

---

## Frontend Component API

### shadcn/ui Components (Phase 4)

**Mandatory:** All UI components must use shadcn/ui

**Location:** `platforms/web/components/`

**Standard Components:**

- Chat interface
- Agent selection
- Session management
- Memory viewer
- Settings panels

**Detailed Spec:** `spec/phase-4/web-ui.md` (TBD - create as needed)

---

## Authentication & Authorization Specifications

### Authentication Methods (Phase 1 & 4)

**Local (Phase 1):**

- Argon2id password hashing
- API keys (generate, revoke, list)
- Session tracking (UUID-based)

**Remote (Phase 4):**

- JWT tokens (access + refresh)
- Session cookies (web UI)
- API keys (programmatic access)

**Security:**

- Passwords: `~/.skyth/auth/pass.json` (hashed)
- API keys: `~/.skyth/auth/api_keys.json` (encrypted)
- OAuth tokens: `~/.skyth/auth/oauth_tokens.json` (encrypted)

**Detailed Specs:**

- Phase 1: `spec/phase-1/authentication.md`
- Phase 4: `spec/phase-4/backend-api.md` (TBD - create as needed)

---

## Memory System Specifications

### Quasar Memory (Phase 3)

**Storage Paths:**

```
~/.skyth/quasar/
├── md/
│   ├── daily/          # Daily summaries (weekly organization)
│   └── session/        # Session summaries (UUID-based)
├── db/                 # Database layers
└── layers.txt          # Enabled layers (e.g., "0 0.5 1 2")
```

**Context Injection:**

- New session: Last day's summary + last session summary
- Continuing session: Last day's summary (refreshed daily)

**Tools:**

- `quasar_search` - Vector search
- `quasar_add` - Add facts
- `quasar_subtract` - Remove facts
- `quasar_entitize` - Entity graphs
- `quasar_compress` - Summarization
- `quasar_think` - Scratchpad (non-reasoning models only)

**Detailed Specs:**

- `spec/phase-3/quasar-architecture.md` (TBD - create as needed)
- `spec/phase-3/quasar-tools.md` (TBD - create as needed)

---

## Event Logging Format

### Quasar Events (Phase 3)

**Event Types:**

- **Quasar:** Standard events (user messages, AI responses, system events)
- **Solar:** User edits (branch creation, filesystem restoration)
- **Nebula:** Regenerations (deactivate previous, filesystem restoration)

**UUID Format:**

```
quasar-{uuid}        # Root event
solar-{uuid}+n       # Solar branch (n = increment)
nebula-{uuid}+n      # Nebula branch
```

**Event Schema:**

```json
{
  "event_id": "quasar-{uuid}",
  "event_type": "quasar|solar|nebula",
  "timestamp": "ISO-8601",
  "user_id": "uuid",
  "content": {},
  "parent_event": "uuid|null",
  "active": "boolean",
  "branches": []
}
```

**Detailed Spec:** `spec/phase-3/event-types-branching.md` (TBD - create as needed)

---

## References

**Master Index:** `spec/PHASE_INDEX.md` - Complete navigation guide

**Mandatory Reading:**

- `spec/arch.md` - Architecture overview
- `spec/plan.md` - Project roadmap
- `spec/components.md` - Component standards

**Phase READMEs:**

- `spec/phase-1/README.md`
- `spec/phase-2/README.md`
- `spec/phase-3/README.md`
- `spec/phase-4/README.md`
- `spec/phase-5/README.md`
- `spec/phase-6/README.md`

**Q&A Source of Truth:**

- `spec/agents/answers/2026-01-29.md` - All architectural decisions

---

## Status

**Specification Organization:** ✅ Complete (phase-wise structure)  
**Implementation:** 🔄 In Progress (Phase 1: 60%)

**Next Steps:**

1. Complete Phase 1 implementation
2. Create detailed TBD specs as needed during implementation
3. Update this index as new specifications are added

---

_Last Updated: 2026-01-31_  
_Specification Version: 2.0 (Phase-wise organization complete)_
