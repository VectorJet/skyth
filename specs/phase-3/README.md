# Phase 3: Logic Gate Protocol (LGP) + Quasar Memory System

**Status:** Specification Complete  
**Priority:** High  
**Timeline:** Weeks 13-20 (after Phase 2)

---

## Overview

Phase 3 implements Skyth's core memory system (Quasar) and tool orchestration language (Logic Gate Protocol). This phase transforms Skyth into a truly intelligent system with persistent memory and advanced reasoning capabilities.

---

## Goals

1. ✅ Implement Quasar 5-layer memory architecture
2. ✅ Build Logic Gate Protocol (LGP) for tool chaining
3. ✅ Integrate ChromaDB + SQLite for initial development
4. ✅ Implement Solars & Nebulas branching system
5. ✅ Create 60+ CLI commands for memory management
6. ✅ Implement 5 core Quasar tools
7. ✅ Build background processing system

---

## Specifications

### Core Specifications

1. **[LGP Specification](./lgp-specification.md)**
   - Logic gates: AND, OR, XOR
   - Operators: PIPE, TO
   - Tool chaining syntax
   - Error handling in chains
   - Nushell (`nu -c`) for execution

2. **[Quasar Architecture](./quasar-architecture.md)**
   - 5-layer database system
   - Layer 0: Canonical (encrypted JSONL)
   - Layer 0.5: ChromaDB (vector search)
   - Layer 1: JSONL (append-only logs)
   - Layer 2: SQLite (relational queries)
   - Layer 3: PostgreSQL + pgvector (optional)
   - Layer 4: Redis (deferred to later phases)

3. **[Session vs Daily Storage](./session-vs-daily-storage.md)**
   - Session-based memory (UUID system)
   - Daily aggregation (weekly organization)
   - Background processing triggers
   - Context injection strategy

4. **[Event Types & Branching](./event-types-branching.md)**
   - Quasar events (all ticks tracked)
   - Solars (user edits)
   - Nebulas (regenerations)
   - UUID-based branch naming
   - Diff storage for efficiency
   - Filesystem state restoration

5. **[Quasar Tools](./quasar-tools.md)**
   - `quasar_search` - Vector search
   - `quasar_add` - Add facts to memory
   - `quasar_subtract` - Remove facts
   - `quasar_entitize` - Entity graphs (LightRAG-inspired)
   - `quasar_compress` - Context compression
   - `quasar_think` - Scratchpad (non-reasoning models only)

6. **[ChromaDB + SQL Integration](./chroma-sql-integration.md)**
   - Parallel write strategy
   - Quasar Context Assembler (CTX)
   - Query cascading logic
   - Agent interface abstraction

---

## Key Deliverables

### Week 13-14: Quasar Foundation (Rust)

- [ ] Quasar core in Rust
- [ ] Python bindings via Maturin
- [ ] Layer 0 (canonical JSONL + AES-256 encryption)
- [ ] Layer 0.5 (ChromaDB integration)
- [ ] Layer 1 (JSONL append-only)
- [ ] Layer 2 (SQLite)

### Week 15-16: Event System & Branching

- [ ] Event type system (Quasar, Solar, Nebula)
- [ ] UUID generation and tracking
- [ ] Branch creation logic
- [ ] Diff storage implementation
- [ ] Filesystem state tracking
- [ ] Restoration logic (Solars/Nebulas)

### Week 17: Quasar Tools

- [ ] quasar_search (vector search)
- [ ] quasar_add (fact addition)
- [ ] quasar_subtract (fact removal)
- [ ] quasar_entitize (entity graphs)
- [ ] quasar_compress (summarization)
- [ ] quasar_think (reasoning scratchpad)

### Week 18: CLI Commands

- [ ] 60+ Quasar CLI commands
- [ ] `quasar timeline` - View branch tree
- [ ] `quasar search` - Memory search
- [ ] `quasar add` - Manual fact addition
- [ ] `quasar sessions` - Session management
- [ ] Navigation and editing commands

### Week 19: LGP Implementation

- [ ] LGP parser (EBNF grammar)
- [ ] Logic gate operators (AND, OR, XOR)
- [ ] PIPE and TO operators
- [ ] Nushell integration (`nu -c`)
- [ ] Error handling in chains
- [ ] TOON output formatting

### Week 20: Background Processing

- [ ] Session-end processing
- [ ] Daily summary generation
- [ ] Embedding creation (gte-tiny)
- [ ] Entity graph updates
- [ ] Workspace summaries
- [ ] Detached mode (non-daemon)

---

## Technologies

### Quasar Core (Rust)
- Rust - Core implementation
- Maturin - Python bindings builder
- serde - Serialization
- AES-256 - Encryption

### Python Bindings
- Python 3.12
- PyO3 - Rust ↔ Python bridge
- Wheels - Pre-built distribution

### Databases
- ChromaDB - Vector database
- SQLite - Relational database
- PostgreSQL + pgvector - Optional (production)

### Embeddings
- TaylorAI/gte-tiny - Default embedding model
- all-MiniLM-L6-v2 - Alternative
- Sentence Transformers - Library

### Tools
- Nushell (`nu`) - Shell for LGP execution
- LightRAG - Entity graph inspiration

---

## Architecture Decisions

### AD3.1: Rust Core with Python Bindings
**Decision:** Implement Quasar in Rust, expose to Python via Maturin  
**Rationale:** Performance, memory safety, efficient encryption  
**Distribution:** Pre-built wheels for common platforms  
**Status:** Approved

### AD3.2: LGP Uses Nushell
**Decision:** Replace bash with `nu -c` for LGP execution  
**Rationale:** Better structured data handling, modern shell features  
**Status:** Approved

### AD3.3: TOON for Tool Outputs Only
**Decision:** Convert tool outputs to TOON, keep inputs as JSON  
**Rationale:** LLMs trained on JSON, TOON best for read-only  
**Token Savings:** ~40%  
**Status:** Approved

### AD3.4: quasar_think for Non-Reasoning Models Only
**Decision:** Only expose quasar_think to non-reasoning models  
**Detection:** Via models.dev API boolean flag  
**Reasoning Models:** o1, o3, etc. bypass quasar_think  
**Status:** Approved

### AD3.5: Parallel Write, Cascading Read
**Decision:** Write to all layers in parallel, read from highest first  
**Rationale:** Minimize latency, maximize query flexibility  
**Status:** Approved

---

## Quasar Memory Architecture

```
┌─────────────────────────────────────────────┐
│         Quasar Context Assembler (CTX)      │
│  (Agents use CTX, not direct DB access)     │
└──────┬──────────────────────────────────────┘
       │
       ├─→ Layer 3: PostgreSQL + pgvector (Optional)
       │   - Production semantic search
       │   - Requires user setup
       │
       ├─→ Layer 2: SQLite
       │   - Relational queries
       │   - Metadata storage
       │
       ├─→ Layer 1: JSONL (Append-only)
       │   - Immutable logs
       │   - Simple backup
       │
       ├─→ Layer 0.5: ChromaDB
       │   - Vector embeddings
       │   - Semantic search (default)
       │
       └─→ Layer 0: Canonical QuasarDB
           - Encrypted JSONL (AES-256)
           - Ground truth
           - Event logs (Solars/Nebulas)
```

---

## Storage Structure

```
~/.skyth/quasar/
├── md/
│   ├── daily/
│   │   ├── January/
│   │   │   ├── 1st/          # Week 1
│   │   │   │   ├── day1.md
│   │   │   │   └── day2.md
│   │   │   ├── 2nd/          # Week 2
│   │   │   └── extras/       # Overflow
│   │   │       └── raw.md
│   │   └── February/
│   └── session/
│       ├── {session_name_1}.md
│       └── {session_name_2}.md
│
├── db/
│   ├── layer0/               # Canonical (encrypted JSONL)
│   ├── chroma/               # ChromaDB files
│   ├── layer1/               # JSONL logs
│   └── layer2.sqlite         # SQLite database
│
├── layers.txt                # Enabled layers (e.g., "0 0.5 1 2")
└── identity/
    └── device_auth/          # Encryption keys
```

---

## LGP Example

### Basic Chain

```
{fetch_location} AND PIPE hotels in {location} AND PIPE {hotel_info} TO cost_calculator
```

**Execution:**
1. Fetch user's location
2. Search for hotels in that location
3. Get hotel information
4. Pass to cost calculator
5. Return results

---

### Error Handling

```python
# Chain execution
try:
    result = execute_lgp_chain(
        "{search_docs} PIPE {summarize} TO {quasar_add}"
    )
except ToolExecutionError as e:
    # Pass error to LLM
    llm_response = await llm.process(
        f"Tool failed: {e.tool} - {e.message}. How should I proceed?"
    )
    # LLM decides: retry, modify chain, or abort
```

---

## Solars & Nebulas

### Solar (User Edit)

**Trigger:** User edits previous message  
**Action:**
1. Purge canonical DB up to Solar sibling branch
2. Create sibling branch with edited content
3. Send deactivated branch to other layers as diff
4. Restore filesystem state to that tick

**Example:**
```
Original message (quasar-uuid-1):
  "What is the capital of Paris?"

User edits → Solar branch created (solar-uuid-1):
  "What is the capital of France?"

Filesystem restored to state before original message.
```

---

### Nebula (Regeneration)

**Trigger:** User requests regeneration OR API error/rate limit  
**Action:**
1. Purge canonical DB up to Nebula sibling branch
2. Create sibling branch with new response
3. Deactivate previous response
4. Send diff to other layers
5. Restore filesystem state

**Example:**
```
Original response (quasar-uuid-1-response):
  "Paris is the capital of France."

User: "Regenerate with more detail"
Nebula branch created (nebula-uuid-1):
  "Paris is the capital and largest city of France, located on the Seine River..."

Previous response deactivated: active = false
Filesystem restored to state before original response.
```

---

## Context Injection

### New Session Start

**System Messages:**
1. Last day's summary (from `daily/`)
2. Last session summary (from `session/`)
3. Workspace daily summary (from `workspace/daily/`)

---

### Continuing Session

**System Messages:**
1. Last day's summary (refresh daily even in active session)
2. Current session context (full history)

---

## CLI Commands (60+)

### Memory Search
```bash
quasar search "Python async patterns"
quasar search --embedding --top-k 10
quasar search --sql "WHERE category='code'"
```

### Timeline & Branching
```bash
quasar timeline                    # Show branch tree
quasar timeline --session {uuid}   # Session-specific timeline
quasar branch --create solar       # Manual branch creation
quasar branch --switch {uuid}      # Switch to branch
```

### Session Management
```bash
quasar sessions list
quasar sessions show {uuid}
quasar sessions export {uuid} --format md
quasar sessions delete {uuid}
```

### Memory Management
```bash
quasar add --fact "User prefers tabs over spaces"
quasar subtract --fact "User prefers spaces"
quasar compress --session {uuid}
quasar entitize --session {uuid}
```

### Layer Management
```bash
quasar layers list                 # Show enabled layers
quasar layers enable 3             # Enable Layer 3 (pgvector)
quasar layers status               # Health check
```

---

## Testing Checklist

- [ ] Layer 0 encryption/decryption works
- [ ] ChromaDB embeddings created correctly
- [ ] SQLite metadata queries work
- [ ] PostgreSQL + pgvector integration (optional)
- [ ] Parallel writes to all layers succeed
- [ ] Cascading reads return correct data
- [ ] Solar branch creation works
- [ ] Nebula branch creation works
- [ ] Filesystem restoration works
- [ ] UUID branch naming correct
- [ ] Diff storage efficient
- [ ] quasar_search returns relevant results
- [ ] quasar_add persists facts
- [ ] quasar_entitize creates graphs
- [ ] LGP parser handles syntax correctly
- [ ] Tool chaining executes in order
- [ ] Error handling in chains works
- [ ] Background processing triggers correctly
- [ ] Daily summaries generated
- [ ] Session summaries generated

---

## Success Criteria

Phase 3 is complete when:

1. ✅ Quasar layers 0-3 functional
2. ✅ Solar/Nebula branching works
3. ✅ LGP parser and executor complete
4. ✅ 5 core tools implemented
5. ✅ 60+ CLI commands working
6. ✅ Background processing operational
7. ✅ All tests pass
8. ✅ Documentation complete

**Estimated Completion:** Week 20  
**Blocking Dependencies:** Phase 2 complete

---

## Known Issues

### To Address in Phase 3
- Large context compression strategy
- Category taxonomy definition
- Branch garbage collection
- Performance optimization for large datasets

### Deferred to Later Phases
- Layer 4 (Redis) → Phase 5
- Custom layer extensions → Phase 6+
- Visual timeline UI → Phase 4

---

## References

### Internal
- Quasar PAPER: `@quasar/PAPER.md`
- Q&A Sections: Q3.1-Q3.6 / A3.1-A3.6
- LightRAG: `@refs/libs/LightRAG`

### External
- Maturin docs: https://maturin.rs
- ChromaDB docs: https://docs.trychroma.com
- Nushell: https://www.nushell.sh

---

*Last Updated: 2026-01-31*  
*Next Review: Start of Phase 3 (after Phase 2 completion)*
