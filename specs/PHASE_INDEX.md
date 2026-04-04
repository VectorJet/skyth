# Skyth Specifications - Phase Organization

**Last Updated:** 2026-01-31  
**Status:** Phase-wise organization complete

---

## Overview

This directory contains all technical specifications for Skyth, organized by implementation phase. Each phase has its own subdirectory with detailed specifications.

---

## Phase Structure

```
spec/
├── README.md                           # This file
├── arch.md                             # Architecture overview (MANDATORY READ)
├── plan.md                             # Project roadmap
├── spec.md                             # Technical specifications
├── components.md                       # Component standards
├── version_information.md              # Version history
│
├── agents/                             # Agent-related specs
│   ├── questions/
│   │   └── 2026-01-29.md              # Architectural questions
│   └── answers/
│       └── 2026-01-29.md              # Complete answers (source of truth)
│
├── phase-1/                            # Onboarding & Authentication
│   ├── README.md
│   ├── onboarding.md
│   ├── config-schema.md
│   ├── authentication.md
│   ├── completion-checklist.md
│   └── messaging-apps.md
│
├── phase-2/                            # Modular Agent Architecture
│   ├── README.md
│   ├── router-vs-generalist.md
│   ├── agent-architecture.md
│   ├── mcp-toon-converter.md
│   ├── cli-interface.md
│   └── platform-priority.md
│
├── phase-3/                            # LGP + Quasar
│   ├── README.md
│   ├── lgp-specification.md
│   ├── quasar-architecture.md
│   ├── session-vs-daily-storage.md
│   ├── event-types-branching.md
│   ├── quasar-tools.md
│   └── chroma-sql-integration.md
│
├── phase-4/                            # Multi-Platform Frontends
│   ├── README.md
│   ├── platform-structure.md
│   ├── backend-api.md
│   ├── web-ui.md
│   └── desktop-app.md
│
├── phase-5/                            # Watcher Mode & Advanced Features
│   ├── README.md
│   ├── watcher-mode.md
│   ├── background-processing.md
│   ├── host-execution-security.md
│   └── epsilon.md
│
└── phase-6/                            # Future Enhancements
    └── README.md
```

---

## Phase Summaries

### Phase 1: Onboarding & Authentication (60% Complete)

**Timeline:** Weeks 1-5  
**Status:** In Progress

**Deliverables:**

- ✅ Interactive TUI onboarding wizard
- ✅ Config.yml schema and validation
- ✅ Argon2id password hashing
- ✅ API key management
- ✅ UUID-based session tracking
- ⚠ Optional: Messaging app integration

**See:** [phase-1/README.md](Skyth/Skyth/spec/phase-1/README.md)

---

### Phase 2: Modular Agent Architecture

**Timeline:** Weeks 6-12  
**Status:** Specification Complete

**Deliverables:**

- Generalist + specialized agents
- Agent-calling-agent system
- Global delegation tools
- MCP-to-TOON converter
- TypeScript CLI (Bun runtime)
- FastAPI backend

**See:** [phase-2/README.md](Skyth/Skyth/spec/phase-2/README.md)

---

### Phase 3: LGP + Quasar

**Timeline:** Weeks 13-20  
**Status:** Specification Complete

**Deliverables:**

- Logic Gate Protocol (tool chaining)
- Quasar 5-layer memory system
- Solars & Nebulas branching
- 60+ CLI commands
- 5 core Quasar tools
- Background processing

**See:** [phase-3/README.md](Skyth/Skyth/spec/phase-3/README.md)

---

### Phase 4: Multi-Platform Frontends

**Timeline:** Weeks 21-25  
**Status:** Specification Complete

**Deliverables:**

- Repository restructure (core/ + platforms/)
- Multi-protocol backend API (REST + SSE + WebSocket)
- Next.js web interface
- Monorepo management (Just + Turborepo)
- Multiple authentication methods

**See:** [phase-4/README.md](Skyth/Skyth/spec/phase-4/README.md)

---

### Phase 5: Watcher Mode & Advanced Features

**Timeline:** Weeks 26-35  
**Status:** Specification Complete

**Deliverables:**

- Watcher mode (file/time/webhook triggers)
- Background processing (detached/daemon)
- Tiered security model
- Epsilon version control
- Tauri desktop app

**See:** [phase-5/README.md](Skyth/Skyth/spec/phase-5/README.md)

---

### Phase 6+: Future Enhancements

**Timeline:** Week 36+  
**Status:** Planning

**Potential Features:**

- Visual agent builder (n8n-like)
- Mobile app (Flutter)
- Agent marketplace (SUR)
- Advanced memory features
- Collaborative features

**See:** [phase-6/README.md](Skyth/Skyth/spec/phase-6/README.md)

---

## Specification Documents

### Mandatory Reading

Before starting ANY work, agents must read:

1. **[arch.md](arch.md)** - Complete architecture overview
2. **[plan.md](plan.md)** - Project roadmap and phases
3. **[spec.md](spec.md)** - Technical specifications
4. **[components.md](Skyth/Skyth/spec/components.md)** - Component standards (NO EMOJIS)
5. **[version_information.md](version_information.md)** - Version history

### Questions & Answers

**Source of Truth:** [agents/answers/2026-01-29.md](Skyth/Skyth/spec/agents/answers/2026-01-29.md)

All architectural decisions are documented in the answers file. Questions are in [agents/questions/2026-01-29.md](Skyth/Skyth/spec/agents/questions/2026-01-29.md).

---

## Phase Dependencies

```
Phase 1 (Foundation)
    ↓
Phase 2 (Agents + CLI)
    ↓
Phase 3 (LGP + Quasar)
    ↓
Phase 4 (Multi-Platform)
    ↓
Phase 5 (Watcher + Security)
    ↓
Phase 6+ (Enhancements)
```

**Critical Path:** Phases 1-3 must complete sequentially. Phases 4-5 can partially overlap.

---

## Key Architectural Decisions

### Hybrid Agent Architecture (A2.1)

- **Decision:** Support both router and generalist modes
- **Default:** Generalist (simpler, more autonomous)
- **Optional:** Router model for agent selection

### Agent Hierarchy (A2.2)

```
[Generalist] → [Specialized Agents] → [Subagents]
```

- 2-level max nesting (Agent → Subagent)
- Circular call prevention via stack tracking
- Global delegation tools for all agents

### MCP-to-TOON Conversion (A2.3)

- **Decision:** Convert tool outputs only (not inputs)
- **Rationale:** LLMs trained on JSON tool-calling
- **Token Savings:** ~40% for structured data

### Quasar Implementation (A3.2)

- **Core:** Rust with Python bindings (Maturin)
- **Layers:** 0, 0.5 (Chroma), 1 (JSONL), 2 (SQLite), 3 (pgvector - optional)
- **Default:** Layers 0 + 0.5 for out-of-box experience

### Repository Structure (A4.1)

```
core/backend/  - Bun Hono (TypeScript)
platforms/     - All client platforms
  shared/      - Shared TypeScript types
  cli/         - Standalone Bun CLI platform package
  web/         - Next.js
  desktop/     - Tauri
  mobile/      - Flutter
```

---

## Implementation Progress

### Completed

- [x] Phase organization structure
- [x] All phase README files
- [x] Comprehensive Q&A documentation
- [x] Architecture decisions documented

### In Progress

- [ ] Phase 1 implementation (90% complete)

### Pending

- [ ] Phase 2-6 implementation
- [ ] Testing strategies
- [ ] Performance benchmarks

---

## How to Use These Specs

### For Developers

1. **Starting new phase:**
   - Read phase README.md
   - Review all specs in that phase directory
   - Check dependencies from previous phases

2. **Implementing features:**
   - Reference specific spec file
   - Follow patterns from `@refs/` examples
   - Update completion checklists

3. **Making changes:**
   - Document architectural decisions
   - Update relevant spec files
   - Cross-reference related phases

### For Agents

1. **Before any task:**
   - Read mandatory specs (arch.md, plan.md, etc.)
   - Check phase-specific specs
   - Review Q&A for context

2. **During implementation:**
   - Follow spec guidelines strictly
   - Use reference implementations
   - Respect component standards (no emojis!)

3. **After completion:**
   - Update completion checklists
   - Document any deviations
   - Update TBD specs if needed

---

## Specification Updates

### Update Process

1. **Propose change:**
   - Create issue or discussion
   - Document rationale

2. **Review:**
   - Team review
   - Impact assessment

3. **Approve:**
   - Update spec files
   - Update affected phases
   - Notify team

4. **Implement:**
   - Follow updated specs
   - Test thoroughly

---

## Testing Requirements

Each phase has testing requirements in its README:

- Unit tests
- Integration tests
- End-to-end tests

See individual phase completion checklists for details.

---

## Documentation Standards

### Spec File Format

All spec files should include:

1. **Header:**

   ```markdown
   # Title

   **Status:** [Complete/In Progress/TBD]
   **Based on:** Q&A reference (if applicable)
   **Date:** YYYY-MM-DD
   ```

2. **Overview:** Brief description

3. **Detailed Sections:** Feature-specific

4. **Examples:** Code/config examples

5. **Testing Checklist:** What to test

6. **References:** Links to related docs

---

## Getting Help

### Questions About Specs

- **Clarification needed:** Create issue in project tracker
- **Missing information:** Check Q&A files first, then ask
- **Contradictions:** Report immediately for resolution

### Contributing

- Follow existing spec format
- Cross-reference related files
- Update table of contents
- Add to completion checklists

---

## Quick Reference

### Phase Completion Criteria

**Phase 1:** Config + Auth working  
**Phase 2:** Agents + CLI functional  
**Phase 3:** Quasar + LGP implemented  
**Phase 4:** Web + Desktop platforms  
**Phase 5:** Watcher + Security complete  
**Phase 6+:** Advanced features (as needed)

### Critical Files

- Architecture: [arch.md](arch.md)
- Roadmap: [plan.md](plan.md)
- Q&A: [agents/answers/2026-01-29.md](Skyth/Skyth/spec/agents/answers/2026-01-29.md)

### Reference Implementations

All reference implementations in `@refs/`:

- Apps: OpenClaw, Nanobot, Quickstar
- Libraries: LightRAG
- Phase-specific: `@refs/phase/phase-N/`

---

## Version History

- **2026-01-31:** Phase organization complete, all READMEs created
- **2026-01-29:** Q&A documentation finalized
- **2026-01-24:** Initial spec files created

---

_This is a living document. Update as specifications evolve._
