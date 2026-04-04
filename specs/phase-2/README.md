# Phase 2: README

**Status:** Specification Complete  
**Priority:** High  
**Timeline:** Weeks 6-12 (after Phase 1 completion)

---

## Overview

Phase 2 establishes the modular agent architecture and primary CLI interface. This phase transforms Skyth from a configuration system into a functional AI agent platform.

---

## Goals

1. ✅ Implement modular agent architecture with generalist + specialist pattern
2. ✅ Build TypeScript CLI (Bun runtime) as primary interface  
3. ✅ Establish agent-calling-agent system with global tools
4. ✅ Integrate MCP-to-TOON converter for token efficiency
5. ✅ Create FastAPI backend serving all platforms

---

## Specifications

### Core Specifications

1. **[Router vs Generalist](./router-vs-generalist.md)**
   - Hybrid approach: Both supported
   - Default: Generalist agent
   - Optional: Router model for agent selection

2. **[Agent Architecture](agent-architecture.md)**
   - Generalist agent (top level)
   - Specialized agents (horizontal)
   - Subagents (vertical decomposition)
   - Global delegation tools

3. **[MCP to TOON Converter](./mcp-toon-converter.md)**
   - Conversion strategy (output only, not input)
   - ~40% token reduction
   - Fallback to JSON on conversion failure

4. **[CLI Interface](./cli-interface.md)**
   - Bun runtime + TypeScript
   - Hybrid CLI + TUI modes
   - WebSocket communication with backend
   - Reference: `@refs/apps/quickstar`

5. **[Platform Development Priority](./platform-priority.md)**
   - Backend API (Python FastAPI) - Week 6-8
   - CLI (Bun/TypeScript) - Week 8-10
   - Parallel development strategy

---

## Key Deliverables

### Week 6-7: Backend Foundation

- [ ] FastAPI backend structure
- [ ] Agent registry system
- [ ] Tool registration system
- [ ] Base agent classes
- [ ] API endpoints (REST)

### Week 8-9: Agent Architecture

- [ ] Generalist agent implementation
- [ ] Specialized agents (code, research, data)
- [ ] Subagent system
- [ ] Global delegation tools (`task`, `delegate`)
- [ ] Circular call prevention

### Week 10-11: CLI Interface

- [ ] Bun/TypeScript CLI setup
- [ ] TUI components
- [ ] WebSocket client
- [ ] Agent switching UI
- [ ] Streaming response display

### Week 12: MCP & Integration

- [ ] MCP-to-TOON converter
- [ ] MCP server integration
- [ ] Integration testing
- [ ] Documentation
- [ ] Performance optimization

---

## Technologies

### Backend (Python)
- FastAPI - Web framework
- uvicorn - ASGI server
- litellm - Multi-provider LLM interface
- asyncio - Async I/O

### CLI (TypeScript)
- Bun - Runtime
- WebSocket - Real-time communication
- Ink (or custom TUI) - Terminal UI
- yaml - Config parsing

### Communication
- REST API - Standard operations
- WebSocket - Real-time streaming
- SSE - Fallback streaming

---

## Architecture Decisions

### AD2.1: Hybrid Router + Generalist
**Decision:** Support both router and generalist modes  
**Rationale:** Flexibility for different use cases  
**Default:** Generalist (simpler, more autonomous)  
**Status:** Approved

### AD2.2: Agent Nesting Strategy
**Decision:** 2-level hierarchy (Agent → Subagent)  
**Rationale:** Prevents complexity, clear boundaries  
**Circular Prevention:** Call stack tracking  
**Status:** Approved

### AD2.3: MCP Output Conversion Only
**Decision:** Convert tool outputs to TOON, keep inputs as JSON  
**Rationale:** LLMs trained on JSON tool-calling, TOON best for read-only data  
**Token Savings:** ~40% for structured outputs  
**Status:** Approved

### AD2.4: Bun for CLI Runtime
**Decision:** Use Bun instead of Node.js  
**Rationale:** Faster, built-in TypeScript, modern APIs  
**Reference:** Quickstar implementation  
**Status:** Approved

---

## Agent Hierarchy

```
───────────────────────────────────────────────
                [GENERALIST]
                     |
          ───────────────────────
          |          |           |
         [A1]       [A2]        [A3]
         |                        |
        ─────                   [SA31]
        |   |
     [SA11] [SA12]
───────────────────────────────────────────────

Legend:
- Generalist: Top-level orchestrator
- A1, A2, A3: Specialized agents (code, research, data)
- SA11, SA12, SA31: Subagents (task-specific)

Rules:
- Agents can call other agents once
- Agents cannot call agents that called them (circular prevention)
- Subagents can only respond to parent agents
- All agents have access to global delegation tools
```

---

## Global Delegation Tools

### Tool: `task`

**Purpose:** Delegate task to specialized subagent

**Usage:**
```python
# Generalist delegates research task
result = await task(
    subagent="research",
    task="Find Python async patterns and best practices",
    context="User building async web scraper"
)
```

**Parameters:**
- `subagent`: Name of subagent to invoke
- `task`: Task description (with context)
- `context`: Additional context (optional)

**Returns:** Subagent's response/results

---

### Tool: `delegate`

**Purpose:** Hand off to another peer agent

**Usage:**
```python
# Code agent delegates to Data agent
result = await delegate(
    agent="data_agent",
    task="Parse CSV and extract user data",
    context_snapshot="User uploaded users.csv with 1000 rows"
)
```

**Parameters:**
- `agent`: Target agent name
- `task`: Task description
- `context_snapshot`: Relevant context from current conversation

**Returns:** Target agent's response

---

### Tool: `are_we_there_yet`

**Purpose:** Check progress of background agent/subagent

**Usage:**
```python
# Generalist checks on code agent progress
status = await are_we_there_yet(task_id="code_agent_task_123")
# Returns: {"status": "in_progress", "progress": "60%", "eta": "2 minutes"}
```

---

## Communication Protocol

### REST API

**Base URL:** `http://localhost:8000/api/v1`

**Endpoints:**
```
POST   /auth/login
POST   /agents/execute
GET    /agents/{agent_id}
GET    /sessions
POST   /sessions
GET    /memory/search
POST   /tools/invoke
```

### WebSocket

**Connection:** `ws://localhost:8000/api/v1/ws/agent/{session_id}`

**Message Format:**
```json
// Client → Server (User message)
{
  "type": "user_message",
  "content": "Write a Python function",
  "session_id": "uuid"
}

// Server → Client (Agent response)
{
  "type": "agent_response",
  "content": "I'll create a function...",
  "session_id": "uuid",
  "timestamp": "2026-01-31T14:00:00Z"
}

// Server → Client (Tool execution)
{
  "type": "tool_execution",
  "tool": "write",
  "status": "running",
  "details": "Writing file: script.py"
}
```

---

## Platform Development Strategy

### Parallel Development

**Backend Team:**
- Build FastAPI endpoints
- Implement agent system
- Create tool registry
- Setup testing

**Frontend Team:**
- Build CLI/TUI interface
- Implement WebSocket client
- Create agent switching UI
- Test against mock/real backend

**Integration:**
- Weekly integration tests
- Shared API contract (OpenAPI spec)
- Mock server for frontend testing

---

## Success Criteria

Phase 2 is complete when:

1. ✅ Generalist agent functional with tool calling
2. ✅ Specialized agents working (code, research, data)
3. ✅ Subagent delegation working
4. ✅ CLI interface complete with TUI
5. ✅ WebSocket communication stable
6. ✅ MCP-to-TOON converter integrated
7. ✅ All core tests pass
8. ✅ Documentation complete

**Estimated Completion:** Week 12  
**Blocking Dependencies:** Phase 1 complete

---

## Known Issues

### To Address in Phase 2
- Agent call loop detection
- Context size management
- Streaming response buffering
- Error handling for agent failures

### Deferred to Later Phases
- Visual agent builder → Phase 4
- Desktop app → Phase 5
- Mobile app → Phase 6+

---

## References

### Internal
- Architecture: `@spec/arch.md`
- Q&A Sections: Q2.1-Q2.5 / A2.1-A2.5
- Agent manifest format: `@backend/agents/README.md`

### External
- Quickstar CLI: `@refs/apps/quickstar`
- OpenClaw (Moltbot): `@refs/apps/openclaw`
- LiteLLM docs: `@refs/docs/litellm`

---

## Testing Strategy

### Unit Tests
- Agent initialization
- Tool registration
- Delegation logic
- Circular call prevention

### Integration Tests
- Agent-to-agent communication
- CLI ↔ Backend WebSocket
- MCP converter accuracy
- Session management

### End-to-End Tests
- Complete user interaction flow
- Multi-agent task completion
- Error recovery scenarios

---

## Next Steps

After Phase 2:
- **Phase 3:** LGP + Quasar implementation
- **Phase 4:** Multi-platform frontends
- **Phase 5:** Watcher mode + background processing

---

*Last Updated: 2026-01-31*  
*Next Review: Start of Phase 2 (after Phase 1 completion)*
