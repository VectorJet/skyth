# Project Roadmap

**Last Updated:** 2026-01-31  
**Status:** Phase-wise organization complete  
**Source of Truth:** `spec/agents/answers/2026-01-29.md`

---

## Overview

Skyth's development follows a **phased approach** with clear milestones and deliverables. Each phase builds upon previous phases, with some overlap possible where dependencies allow.

**Total Timeline:** ~35 weeks for core platform (Phases 1-5), with Phase 6+ for advanced features.

---

## Development Philosophy

### CLI-First Approach
- **Primary Interface:** TypeScript CLI (Bun runtime)
- **Unified Backend:** FastAPI serving all platforms
- **Platform Expansion:** Web → Desktop → Mobile

### Incremental & Tested
- Each phase has completion criteria
- Comprehensive testing at each stage
- No phase advancement until previous phase stable

### Community-Driven
- Open for feedback at each phase
- Adjust priorities based on user needs
- Transparent progress tracking

---

## Phase 1: Onboarding & Authentication

**Timeline:** Weeks 1-5  
**Status:** 60% Complete  
**Priority:** Critical (Foundation)

### Goals

1. ✅ Seamless user onboarding (interactive + non-interactive)
2. ✅ Secure authentication system (local + API)
3. ✅ Robust configuration management
4. ✅ Session tracking foundation
5. ⚠ Optional: Multi-platform messaging integration

### Deliverables

**Core Requirements:**
- [x] User authentication system (Argon2id password hashing)
- [x] Session management (UUID-based)
- [x] Config schema (`~/.skyth/config/config.yml`)
- [ ] Onboarding wizard (TUI)
  - [ ] Interactive mode with provider/model selection
  - [ ] Non-interactive mode with CLI flags
  - [ ] OAuth support (Anthropic, Google)
  - [ ] API key validation (models.dev API)
- [ ] API key management (`skyth auth create-key`, `revoke-key`)
- [ ] Config validation on startup

**Optional Features:**
- [ ] Messaging app integration (Telegram, WhatsApp)
  - Reference: `@refs/apps/nanobot`
  - Can be deferred to Phase 2-3

### Success Criteria

1. ✅ User runs `skyth init` and completes onboarding
2. ✅ Config file created with valid schema
3. ✅ Authentication works (password + API keys)
4. ✅ Sessions tracked with UUIDs
5. ✅ All tests pass (unit + integration + E2E)
6. ✅ Documentation complete

**Current Progress:** 60%  
**Blocking Issues:** None  
**Next Steps:** Complete onboarding wizard UI

**Detailed Specs:** `spec/phase-1/README.md`

---

## Phase 2: Modular Agent Architecture

**Timeline:** Weeks 6-12  
**Status:** Specification Complete  
**Priority:** High

### Goals

1. ✅ Implement modular agent architecture (generalist + specialist)
2. ✅ Build TypeScript CLI as primary interface
3. ✅ Establish agent-calling-agent system with global tools
4. ✅ Integrate MCP-to-TOON converter for token efficiency
5. ✅ Create FastAPI backend serving all platforms

### Deliverables

**Week 6-7: Backend Foundation**
- [ ] FastAPI backend structure
- [ ] Agent registry system
- [ ] Tool registration system
- [ ] Base agent classes (`BaseAgent`, `BaseTool`, `BasePipeline`)
- [ ] REST API endpoints

**Week 8-9: Agent Architecture**
- [ ] Generalist agent implementation
- [ ] Specialized agents (code, research, data)
- [ ] Subagent system
- [ ] Global delegation tools (`task`, `delegate`, `are_we_there_yet`)
- [ ] Circular call prevention (call stack tracking)

**Week 10-11: CLI Interface**
- [ ] Bun/TypeScript CLI setup
- [ ] TUI components (interactive terminal UI)
- [ ] WebSocket client (real-time communication)
- [ ] Agent switching UI
- [ ] Streaming response display

**Week 12: MCP & Integration**
- [ ] MCP-to-TOON converter
  - Convert tool **outputs** only (not inputs)
  - ~40% token reduction
  - Fallback to JSON on failure
- [ ] MCP server integration
- [ ] Integration testing
- [ ] Performance optimization

### Agent Hierarchy

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

**Rules:**
- 2-level max nesting (Agent → Subagent)
- Circular call prevention via stack tracking
- Full context for agents, minimal for subagents
- Global tools for all agents (not subagents)

### Technologies

**Backend:**
- Python 3.12 + FastAPI
- uv (package management)
- litellm (multi-provider LLM interface)

**CLI:**
- Bun runtime
- TypeScript
- WebSocket client

### Success Criteria

1. ✅ Generalist agent functional with tool calling
2. ✅ Specialized agents working (code, research, data)
3. ✅ Subagent delegation working
4. ✅ CLI interface complete with TUI
5. ✅ WebSocket communication stable
6. ✅ MCP-to-TOON converter integrated
7. ✅ All core tests pass
8. ✅ Documentation complete

**Estimated Completion:** Week 12  
**Dependencies:** Phase 1 complete

**Detailed Specs:** `spec/phase-2/README.md`

---

## Phase 3: LGP (Logic Gate Protocol) + Quasar

**Timeline:** Weeks 13-20  
**Status:** Specification Complete  
**Priority:** High

### Goals

1. ✅ Implement Quasar 5-layer memory architecture
2. ✅ Build Logic Gate Protocol for tool chaining
3. ✅ Integrate ChromaDB + SQLite for initial development
4. ✅ Implement Solars & Nebulas branching system
5. ✅ Create 60+ CLI commands for memory management
6. ✅ Implement 5 core Quasar tools
7. ✅ Build background processing system

### Deliverables

**Week 13-14: Quasar Foundation (Rust)**
- [ ] Quasar core in Rust
- [ ] Python bindings via Maturin
- [ ] Layer 0 (canonical JSONL + AES-256)
- [ ] Layer 0.5 (ChromaDB integration)
- [ ] Layer 1 (JSONL append-only)
- [ ] Layer 2 (SQLite)

**Week 15-16: Event System & Branching**
- [ ] Event type system (Quasar, Solar, Nebula)
- [ ] UUID generation and tracking
- [ ] Branch creation logic
- [ ] Diff storage implementation
- [ ] Filesystem state tracking
- [ ] Restoration logic (Solars/Nebulas)

**Week 17: Quasar Tools**
- [ ] `quasar_search` - Vector search
- [ ] `quasar_add` - Fact addition
- [ ] `quasar_subtract` - Fact removal
- [ ] `quasar_entitize` - Entity graphs (LightRAG-inspired)
- [ ] `quasar_compress` - Summarization
- [ ] `quasar_think` - Scratchpad (non-reasoning models only)

**Week 18: CLI Commands (60+)**
- [ ] `quasar timeline` - Branch tree visualization
- [ ] `quasar search` - Memory search
- [ ] `quasar sessions` - Session management
- [ ] `quasar branch` - Branch operations
- [ ] Navigation and editing commands

**Week 19: LGP Implementation**
- [ ] LGP parser (EBNF grammar)
- [ ] Logic gates (AND, OR, XOR)
- [ ] Operators (PIPE, TO)
- [ ] Nushell integration (`nu -c`)
- [ ] Error handling in chains
- [ ] TOON output formatting

**Week 20: Background Processing**
- [ ] Session-end processing
- [ ] Daily summary generation
- [ ] Embedding creation (gte-tiny)
- [ ] Entity graph updates
- [ ] Workspace summaries
- [ ] Detached mode (non-daemon)

### Quasar 5-Layer Architecture

**Layer 0:** Canonical QuasarDB (encrypted JSONL, AES-256)  
**Layer 0.5:** ChromaDB (vector search, default)  
**Layer 1:** JSONL (append-only logs)  
**Layer 2:** SQLite (relational queries)  
**Layer 3:** PostgreSQL + pgvector (optional, production)  
**Layer 4:** Redis (deferred to Phase 7)

**Write:** Parallel to all layers (minimize latency)  
**Read:** Cascade from highest layer (L3 → L2 → L1 → L0.5 → L0)

### Event Types

**Quasar Events:** All ticks (system, user, AI responses)  
**Solars:** User edits (create branch, restore filesystem)  
**Nebulas:** Regenerations (deactivate previous, restore filesystem)

**UUID Format:**
- `quasar-{uuid}` - Root events
- `solar-{uuid}+n` - Solar branches (n = increment)
- `nebula-{uuid}+n` - Nebula branches

### Technologies

**Quasar Core:**
- Rust + Maturin (Python bindings)
- ChromaDB (vector database)
- SQLite (relational database)

**Embeddings:**
- TaylorAI/gte-tiny (default)
- all-MiniLM-L6-v2 (alternative)
- Sentence Transformers library

**Tools:**
- Nushell (`nu`) - Shell for LGP
- LightRAG - Entity graph inspiration

### Success Criteria

1. ✅ Quasar layers 0-3 functional
2. ✅ Solar/Nebula branching works
3. ✅ LGP parser and executor complete
4. ✅ 5 core tools implemented
5. ✅ 60+ CLI commands working
6. ✅ Background processing operational
7. ✅ All tests pass
8. ✅ Documentation complete

**Estimated Completion:** Week 20  
**Dependencies:** Phase 2 complete

**Detailed Specs:** `spec/phase-3/README.md`

---

## Phase 4: Multi-Platform Frontends

**Timeline:** Weeks 21-25  
**Status:** Specification Complete  
**Priority:** Medium

### Goals

1. ✅ Restructure repository (core/ + platforms/)
2. ✅ Implement multi-protocol backend API (REST + SSE + WebSocket)
3. ✅ Build Next.js web interface
4. ✅ Setup monorepo management (Just + Turborepo)
5. ⚠ Defer visual agent builder to Phase 6+

### Deliverables

**Week 21-22: Repository Restructure**
- [ ] Create `core/` and `platforms/` directories
- [ ] Move backend to `core/backend/`
- [ ] Setup Turborepo for TypeScript platforms
- [ ] Create `justfile` with all commands
- [ ] Extract shared types to `platforms/shared/`

**Week 23-24: Backend API**
- [ ] REST endpoints (standard operations)
- [ ] SSE streaming (one-way)
- [ ] WebSocket server (bidirectional)
- [ ] Multiple auth methods (JWT, session, API key)
- [ ] API documentation (OpenAPI)

**Week 25: Web UI**
- [ ] Next.js App Router setup
- [ ] Basic chat interface
- [ ] Agent selection
- [ ] Session management UI
- [ ] Memory viewer
- [ ] Settings page

### Repository Structure

```
Skyth/
├── justfile                    # Primary dev interface
├── turbo.json                  # TS task orchestration
│
├── core/
│   └── backend/                # Python FastAPI
│
├── platforms/
│   ├── shared/                 # Shared TS types
│   ├── cli/                    # Bun CLI (Phase 2)
│   ├── web/                    # Next.js (Phase 4)
│   ├── desktop/                # Tauri (Phase 5)
│   └── mobile/                 # Flutter (Phase 6+)
│
└── spec/                       # Phase-wise specs
```

### Communication Protocols

**REST API:** Standard operations (CRUD, config, auth)  
**SSE:** One-way streaming (agent responses, progress)  
**WebSocket:** Bidirectional (interactive sessions)

### Technologies

**Backend:**
- FastAPI + WebSockets + SSE
- Multiple auth methods

**Web:**
- Next.js 14+ (App Router)
- shadcn/ui (component library)
- Bun (package manager)

**Monorepo:**
- Just (primary developer interface)
- Turborepo (TypeScript orchestration)
- Bun workspaces

### Success Criteria

1. ✅ Repository restructured
2. ✅ Backend API implements all protocols
3. ✅ Web UI functional with basic features
4. ✅ Multiple auth methods working
5. ✅ Monorepo management stable
6. ✅ All tests pass
7. ✅ Documentation complete

**Estimated Completion:** Week 25  
**Dependencies:** Phase 3 complete

**Detailed Specs:** `spec/phase-4/README.md`

---

## Phase 5: Watcher Mode & Advanced Features

**Timeline:** Weeks 26-35  
**Status:** Specification Complete  
**Priority:** Medium

### Goals

1. ✅ Implement watcher mode for continuous monitoring
2. ✅ Build background processing system
3. ✅ Create tiered security model for host execution
4. ✅ Implement Epsilon version control
5. ✅ Create Tauri desktop application

### Deliverables

**Week 26-30: Desktop App**
- [ ] Tauri project setup
- [ ] Native OS integration
- [ ] Embedded backend option
- [ ] WebSocket client
- [ ] Platform-specific features (tray icon, notifications)

**Week 31: Watcher Mode**
- [ ] File system monitoring
- [ ] Cron-based scheduling
- [ ] Webhook receivers
- [ ] Resource management
- [ ] Daemon vs detached mode

**Week 32: Background Processing**
- [ ] Session-end triggers
- [ ] Daily aggregation
- [ ] Embedding pipeline
- [ ] Detached process management
- [ ] Optional daemon mode

**Week 33: Security Model**
- [ ] Tiered trust levels (Paranoid, Standard, Trust)
- [ ] Command interceptor
- [ ] Approval UI
- [ ] Whitelist/blacklist engine
- [ ] Dangerous command detector

**Week 34: Epsilon System**
- [ ] Filesystem state snapshots
- [ ] Tick-based versioning
- [ ] State restoration
- [ ] Integration with Solars/Nebulas
- [ ] CLI for time-travel

**Week 35: Integration & Testing**
- [ ] Cross-platform testing
- [ ] Performance optimization
- [ ] Security audit
- [ ] Documentation

### Security Tiers

**Paranoid:** Approve ALL commands  
**Standard (Default):** Approve dangerous/mutating commands  
**Trust/Dev:** No approval (VPS/isolated)

### Watcher Triggers

**File System:** inotify/FSEvents monitoring  
**Time-Based:** Cron schedules  
**External:** Webhooks

### Technologies

**Watcher:**
- Python `watchdog` (file monitoring)
- `schedule` (cron-like)
- FastAPI webhooks

**Desktop:**
- Tauri v2
- Rust + TypeScript

**Epsilon:**
- Git-like diff algorithm
- Filesystem snapshots

### Success Criteria

1. ✅ Watcher mode functional
2. ✅ Background processing working
3. ✅ Security tiers enforced
4. ✅ Epsilon snapshots/restoration work
5. ✅ Desktop app builds for all platforms
6. ✅ All tests pass
7. ✅ Documentation complete

**Estimated Completion:** Week 35  
**Dependencies:** Phase 4 complete

**Detailed Specs:** `spec/phase-5/README.md`

---

## Phase 6+: Future Enhancements

**Timeline:** Week 36+  
**Status:** Planning  
**Priority:** Low (based on user feedback)

### Potential Features

**Visual Agent Builder** (High Priority - Phase 6)
- n8n-like workflow editor
- Drag-and-drop agent creation
- Tool pipeline designer
- Live testing
- Timeline: Weeks 36-42

**Mobile Application** (Medium Priority - Phase 6-7)
- Flutter (iOS + Android)
- Push notifications
- Voice input
- Remote backend
- Timeline: Weeks 36-48

**Agent Marketplace (SUR)** (Phase 10)
- Community agents/tools
- Discovery and search
- Version management
- Security scanning

**Advanced Memory Features** (Phase 7)
- Layer 4 (Redis) implementation
- Custom layer extensions
- Advanced entity graphs
- Temporal reasoning

**Collaborative Features** (Phase 8)
- Team workspaces
- Shared memory
- Multi-user support
- RBAC

**Platform Expansion** (Phase 9+)
- Discord bot
- Slack integration
- VS Code extension

**See:** `spec/phase-6/README.md`

---

## Version Strategy

### Semantic Versioning

**Format:** `MAJOR.MINOR.PATCH`

**Phase Mapping:**
- Phase 1 completion → v0.1.0
- Phase 2 completion → v0.2.0
- Phase 3 completion → v0.3.0
- Phase 4 completion → v0.4.0
- Phase 5 completion → v0.5.0
- v1.0.0 → Production-ready (Phase 6-7?)

---

## Critical Path

```
Phase 1 (Foundation) - MUST complete first
    ↓
Phase 2 (Agents + CLI) - MUST complete second
    ↓
Phase 3 (LGP + Quasar) - MUST complete third
    ↓
Phase 4 (Multi-Platform) - Can partially overlap with Phase 5
    ↓
Phase 5 (Watcher + Security + Desktop) - Can partially overlap with Phase 4
    ↓
Phase 6+ (Enhancements) - Flexible based on feedback
```

---

## Progress Tracking

### Current Status

**Phase 1:** 60% Complete (in progress)  
**Phase 2:** Specification complete (pending implementation)  
**Phase 3:** Specification complete (pending implementation)  
**Phase 4:** Specification complete (pending implementation)  
**Phase 5:** Specification complete (pending implementation)  
**Phase 6+:** Planning phase

### Completion Metrics

Each phase tracks:
- [ ] Deliverables checklist
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Documentation complete
- [ ] User testing (internal)
- [ ] No critical bugs

---

## Notes

- **Flexibility:** Roadmap subject to change based on feedback and discoveries
- **Overlap:** Phases 4-5 may overlap where dependencies allow
- **Community:** Open for feedback and contributions at each phase
- **Documentation:** Living document, updated as project evolves

---

## References

**Phase Details:**
- Phase 1: `spec/phase-1/README.md`
- Phase 2: `spec/phase-2/README.md`
- Phase 3: `spec/phase-3/README.md`
- Phase 4: `spec/phase-4/README.md`
- Phase 5: `spec/phase-5/README.md`
- Phase 6+: `spec/phase-6/README.md`

**Master Index:** `spec/PHASE_INDEX.md`  
**Architecture:** `spec/arch.md`  
**Q&A Source:** `spec/agents/answers/2026-01-29.md`

---

*Last Updated: 2026-01-31*  
*Roadmap Version: 2.0 (Phase-wise organization complete)*
