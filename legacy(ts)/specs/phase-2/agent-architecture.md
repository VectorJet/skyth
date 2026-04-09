# Phase 2: Agent Architecture

**Status:** Specification Complete  
**Based on:** Q2.2 / A2.2  
**Date:** 2026-01-31

---

## Overview

Skyth adopts a **hybrid delegation model** supporting both inter-agent task delegation (horizontal) and hierarchical subagent execution (vertical).

---

## Architecture Pattern

### Three-Tier Hierarchy

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
        |   |                   Parser
     [SA11] [SA12]
     Debug   Test
───────────────────────────────────────────────
```

**Levels:**
1. **Generalist (Top):** Orchestrator, decides when to delegate
2. **Agents (Horizontal):** Specialized capabilities (code, research, data)
3. **Subagents (Vertical):** Task-specific, disposable execution contexts

---

## Agent Roles

### Generalist Agent

**Purpose:** Primary orchestrator, handles general queries and delegates specialized tasks

**Capabilities:**
- Full context access (entire conversation history)
- All global tools available
- Decides when to delegate to specialists
- Can call multiple agents in parallel
- Handles user communication

**Tools:**
- All base tools (bash, read, edit, write, glob, grep)
- Global delegation tools (task, delegate, are_we_there_yet)
- Quasar tools (search, add, subtract, entitize, compress)

**Example Usage:**
```
User: "Research Python async patterns and implement an example"

Generalist:
1. Calls delegate(agent="research", task="Find async patterns")
2. Waits for research results
3. Calls delegate(agent="code", task="Implement example based on research")
4. Combines results and responds to user
```

---

### Specialized Agents

**Purpose:** Domain-specific expertise and tool access

**Agent Types:**

#### 1. Code Agent (A1)
**Specialty:** Code generation, refactoring, debugging  
**Tools:**
- bash, read, edit, write, glob, grep
- LSP tools (goto definition, find references)
- Code execution tools
- Test runners

**Subagents:**
- Debug Subagent (SA11): Focused debugging sessions
- Test Subagent (SA12): Test generation and execution

---

#### 2. Research Agent (A2)
**Specialty:** Information gathering, analysis, summarization  
**Tools:**
- web_search (via MCP)
- web_fetch
- quasar_search
- Document analysis tools

**Subagents:** Optional (can be stateless)

---

#### 3. Data Agent (A3)
**Specialty:** Data processing, analysis, transformation  
**Tools:**
- CSV/JSON parsers
- SQL query tools
- Data visualization
- Statistical analysis

**Subagents:**
- Parser Subagent (SA31): Specialized parsing tasks
- Analysis Subagent: Statistical computations

---

### Subagents

**Purpose:** Disposable, task-specific execution contexts

**Characteristics:**
- **Stateless:** Don't persist beyond task completion
- **Narrow scope:** Handle specific subtasks only
- **Limited tools:** Minimal toolset for specific job
- **No delegation:** Cannot call other agents/subagents
- **Todo-driven:** Receive structured task with context

**Lifespan:**
```
Parent Agent creates Subagent
    ↓
Subagent receives Todo (task + context)
    ↓
Subagent executes using limited tools
    ↓
Subagent returns results to Parent
    ↓
Subagent terminated
```

---

## Delegation Mechanisms

### 1. Agent-to-Agent Delegation

**Tool:** `delegate(agent, task, context_snapshot)`

**Usage:**
```python
# Generalist → Code Agent
result = await delegate(
    agent="code_agent",
    task="Refactor calculate_total function to use dataclasses",
    context_snapshot="User wants cleaner code structure"
)
```

**Flow:**
1. Generalist pauses current execution
2. Code Agent receives task + context snapshot
3. Code Agent executes with full capabilities
4. Code Agent returns results
5. Generalist resumes with results

---

### 2. Agent-to-Subagent Delegation

**Tool:** `task(subagent, todo)`

**Todo Structure:**
```markdown
## Task: Debug connection timeout

### Context
User experiencing timeout errors when connecting to API.
Relevant file: src/client.py:45-67

### Instructions
1. Read the connection code
2. Identify timeout handling
3. Suggest fix with code diff

### Expected Output
Code diff showing timeout fix
```

**Usage:**
```python
# Code Agent → Debug Subagent
result = await task(
    subagent="debug",
    todo=todo_object
)
```

**Flow:**
1. Agent creates Todo with task description
2. Agent calls subagent with Todo
3. Subagent executes in isolated context
4. Subagent returns results
5. Agent integrates results
6. Subagent terminated

---

## Call Graph Rules

### Horizontal Rules (Agent-to-Agent)

**Rule 1:** Agents can call other agents **once** per execution path

```python
# ✅ ALLOWED
Generalist → Code Agent → Research Agent
```

**Rule 2:** Agents **cannot call** agents that called them (circular prevention)

```python
# ❌ FORBIDDEN
Code Agent → Research Agent → Code Agent  # Circular!
```

**Rule 3:** Agents **can request** access to previous agent's results

```python
# Code Agent wants Research Agent results (already executed)
context = await get_agent_context("research_agent", task_id="xyz")
```

**Rule 4:** Agents **can request** Generalist intervention

```python
# Code Agent unsure how to proceed
await request_generalist(
    reason="Need clarification on requirement",
    question="Should I use async or sync implementation?"
)
```

---

### Vertical Rules (Agent-to-Subagent)

**Rule 1:** Subagents **can only respond** to parent agent

```python
# ✅ ALLOWED
Code Agent → Debug Subagent → [returns to Code Agent]

# ❌ FORBIDDEN
Code Agent → Debug Subagent → Test Subagent  # Subagent calling subagent!
```

**Rule 2:** Subagents **cannot delegate**

Subagents have NO access to `delegate` or `task` tools.

**Rule 3:** Subagents **can request** parent agent to use global tools

```python
# Debug Subagent needs web search (doesn't have tool)
await request_parent_tool(
    tool="web_search",
    query="Python connection timeout best practices"
)
# Parent executes tool, passes result to subagent
```

---

## Context Passing

### Generalist & Agents: Full Context

**What they receive:**
- Complete conversation history
- All Quasar memories
- Session metadata
- Previous agent outputs (if applicable)

**Why:**
- Need full picture to make informed decisions
- Can handle follow-up questions
- Maintain conversation coherence

---

### Subagents: Minimal Context

**What they receive:**
- **Todo:** Structured task description
- **Context:** Relevant context only (not full conversation)
- **Tools:** Minimal toolset

**Why:**
- Disposable agents don't need full history
- Reduces token usage
- Faster execution
- Prevents context leakage

**Example Todo:**
```markdown
## Task: Parse CSV file

### Context
File: data/users.csv
Columns: id, name, email, role
Goal: Extract users with role="admin"

### Instructions
1. Read CSV file
2. Filter rows where role="admin"
3. Return list of admin user objects

### Expected Output
```json
[
  {"id": 1, "name": "Alice", "email": "alice@example.com"},
  ...
]
```
```

---

## Circular Call Prevention

### Problem

```python
# User asks Generalist
Generalist → Code Agent (needs research)
Code Agent → Research Agent (needs code example)
Research Agent → Code Agent  # ← CIRCULAR LOOP!
```

---

### Solution: Call Stack Tracking

**Implementation:**
```python
class CallStack:
    def __init__(self):
        self.stack = []
    
    def can_call(self, caller: str, callee: str) -> bool:
        """Check if caller can call callee without circular reference"""
        
        # Get caller's position in stack
        try:
            caller_index = self.stack.index(caller)
        except ValueError:
            # Caller not in stack (shouldn't happen)
            return False
        
        # Check if callee appears BEFORE caller (circular)
        callee_in_history = callee in self.stack[:caller_index]
        
        if callee_in_history:
            raise CircularCallError(
                f"{caller} cannot call {callee} (circular reference detected)"
            )
        
        return True
    
    def push(self, agent: str):
        """Add agent to call stack"""
        self.stack.append(agent)
    
    def pop(self):
        """Remove agent from stack"""
        self.stack.pop()
```

**Usage:**
```python
# Generalist calls Code Agent
call_stack.push("generalist")
call_stack.push("code_agent")

# Code Agent attempts to call Generalist
if call_stack.can_call("code_agent", "generalist"):
    # This would raise CircularCallError
    delegate(agent="generalist", ...)
else:
    # Handle: request context or use alternative approach
    pass

call_stack.pop()  # code_agent
call_stack.pop()  # generalist
```

---

### Alternative: Request Context Snapshot

Instead of calling agent again, request its previous output:

```python
# Code Agent wants Research Agent results (already executed)
# ❌ Don't do this:
result = await delegate(agent="research", ...)  # Circular!

# ✅ Do this instead:
previous_result = await get_agent_output(agent="research", task_id="xyz")
```

---

## Agent Response Handling

### Synchronous Delegation

**Pattern:** Wait for agent to complete before continuing

```python
# Generalist delegates and waits
result = await delegate(agent="code_agent", task="Fix bug")
# Generalist blocked until code_agent responds
print(f"Code Agent fixed: {result}")
```

---

### Asynchronous Delegation

**Pattern:** Delegate and continue with other tasks

```python
# Generalist delegates to multiple agents in parallel
task1 = asyncio.create_task(
    delegate(agent="code_agent", task="Write function")
)
task2 = asyncio.create_task(
    delegate(agent="research", task="Find best practices")
)

# Generalist continues doing other work
await chat_with_user("I've started the tasks...")

# Check progress
status = await are_we_there_yet(task_id=task1.id)

# Wait for results when needed
result1 = await task1
result2 = await task2
```

---

### Progress Checking

**Tool:** `are_we_there_yet(task_id)`

```python
# Generalist checks on Code Agent
status = await are_we_there_yet(task_id="code_agent_task_123")

# Returns:
{
    "status": "in_progress",  # or "complete", "failed", "pending"
    "progress": "60%",
    "eta": "2 minutes",
    "current_step": "Running tests",
    "output_preview": "3 tests passing, 1 failing..."
}
```

---

## Tool Inheritance

### Agents: Separate Tool Sets

**Generalist Tools:**
- All base tools
- All global tools
- All Quasar tools
- MCP tools (if configured)

**Code Agent Tools:**
- bash, read, edit, write, glob, grep
- LSP tools
- Code runners
- Test frameworks
- Global delegation tools

**Research Agent Tools:**
- web_search, web_fetch
- quasar_search
- Document readers
- Global delegation tools

**Agents do NOT inherit parent tools** - each has own configured toolset.

---

### Subagents: Minimal Tools

**Debug Subagent (under Code Agent):**
- read
- grep
- Stack trace analyzer

**Parser Subagent (under Data Agent):**
- read
- CSV parser
- JSON parser

**Subagents have NO delegation tools** - cannot call other agents.

---

## Global Tools Access

### Available to All Agents (Not Subagents)

**Delegation:**
- `delegate(agent, task, context)` - Call peer agent
- `task(subagent, todo)` - Spawn subagent

**Progress:**
- `are_we_there_yet(task_id)` - Check agent progress

**Context:**
- `get_agent_output(agent, task_id)` - Get previous agent result
- `request_generalist(reason, question)` - Escalate to generalist

---

## Agent Manifest

### Format

**File:** `backend/agents/{agent_name}/agent_manifest.json`

```json
{
  "name": "code_agent",
  "display_name": "Code Agent",
  "description": "Specialized in code generation, refactoring, and debugging",
  "version": "1.0.0",
  "type": "specialized",
  "capabilities": [
    "code_generation",
    "refactoring",
    "debugging",
    "testing"
  ],
  "tools": [
    "bash",
    "read",
    "edit",
    "write",
    "glob",
    "grep",
    "delegate",
    "task"
  ],
  "subagents": [
    "debug",
    "test"
  ],
  "max_context_tokens": 100000,
  "model_preferences": {
    "primary": "anthropic/claude-sonnet-4",
    "fallback": "openai/gpt-4o"
  }
}
```

---

## Testing Checklist

- [ ] Generalist can delegate to specialized agents
- [ ] Specialized agents can spawn subagents
- [ ] Subagents return results to parent only
- [ ] Circular call detection works
- [ ] Call stack tracking accurate
- [ ] Context snapshot retrieval works
- [ ] are_we_there_yet returns correct status
- [ ] Async delegation (parallel agents) works
- [ ] Tool inheritance enforced correctly
- [ ] Agent manifest loading works

---

## Performance Considerations

### Context Size Management

- Generalist: Full context (large)
- Agents: Filtered context (medium)
- Subagents: Minimal context (small)

**Token Budget:**
- Generalist: 100K+ tokens
- Agents: 50K tokens
- Subagents: 10K tokens

---

### Parallel Execution

```python
# Execute multiple agents in parallel
async def handle_complex_task():
    tasks = [
        delegate(agent="code", task="Write function"),
        delegate(agent="research", task="Find docs"),
        delegate(agent="data", task="Parse file")
    ]
    
    results = await asyncio.gather(*tasks)
    return combine_results(results)
```

---

## Error Handling

### Agent Failure

```python
try:
    result = await delegate(agent="code", task="Fix bug")
except AgentError as e:
    # Log error
    logger.error(f"Code agent failed: {e}")
    
    # Notify user
    await notify_user(f"Agent failed: {e.message}")
    
    # Retry or fallback
    result = await delegate(agent="generalist", task="Manual fix needed")
```

---

### Circular Call Error

```python
try:
    result = await delegate(agent="research", task="Find info")
except CircularCallError:
    # Instead of calling again, request previous output
    result = await get_agent_output(agent="research", task_id="previous")
```

---

## References

- Q2.2 / A2.2: Agent-calling-agent architecture
- Global Tools: `@spec/agents/questions/what_are/global_tools.md`
- Agent Manifest: `@backend/agents/README.md`
