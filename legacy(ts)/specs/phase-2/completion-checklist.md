# Phase 2: Completion Checklist

**Status:** In Progress  
**Based on:** Phase 2 specs + Phase 1 deferred items + OpenClaw Migration  
**Date:** 2026-02-13

---

## Priority 0: OpenClaw Migration (NEW - Highest Priority)

### 0.1 Data Migration Tool

- [x] **Create migration CLI command**
  - [x] `skyth migrate openclaw` command
  - [x] Detect OpenClaw installation at `~/.openclaw/`
  - [x] Copy agent data to `~/.skyth/`
  - [x] Migrate credentials
  - [x] Migrate sessions
  - [x] Migrate agent configurations

- [x] **OpenClaw data directories to migrate**
  - [x] `~/.openclaw/workspace/AGENTS.md` → `~/.skyth/agents/default/AGENTS.md`
  - [x] `~/.openclaw/workspace/memory/` → `~/.skyth/memory/`
  - [x] `~/.openclaw/workspace/skills/` → `~/.skyth/skills/`
  - [x] `~/.openclaw/cron/` → `~/.skyth/cron/`
  - [x] Channel credentials discovery and migration

### 0.2 Agent Body Concept

- [ ] **Implement agent body migration**
  - [ ] Inform agent about new body (Skyth)
  - [ ] Preserve memories (Quasar integration)
  - [ ] Secure storage (LGP, Quasar)
  - [ ] Easier tool access

- [ ] **Agent self-awareness prompt**
  - [ ] System prompt update for migration
  - [ ] Explain new capabilities
  - [ ] Reference old identity/body

### 0.3 Gateway Implementation (Copied from OpenClaw)

- [ ] **Copy gateway from refs**
  - [ ] Reference: `refs/apps/openclaw/src/gateway/`
  - [ ] WebSocket server
  - [ ] HTTP endpoints
  - [ ] Session management

- [ ] **Core gateway components**
  - [ ] `server.ts` / `server.impl.ts` - Main server
  - [ ] `server-methods/` - API methods
  - [ ] `ws-connection/` - WebSocket handling
  - [ ] `hooks.ts` - Lifecycle hooks

### 0.4 Messaging App Integration (Copied from OpenClaw)

- [ ] **Copy channel implementations**
  - [ ] Reference: `refs/apps/openclaw/src/telegram/`
  - [ ] Reference: `refs/apps/openclaw/src/discord/`
  - [ ] Reference: `refs/apps/openclaw/src/slack/`
  - [ ] Reference: `refs/apps/openclaw/src/signal/`
  - [ ] Reference: `refs/apps/openclaw/src/imessage/`
  - [ ] Reference: `refs/apps/openclaw/src/web/` (WhatsApp)

- [ ] **Channel registry**
  - [ ] Unified channel interface
  - [ ] Auto-discovery
  - [ ] Status checking

### 0.5 24/7 Running Agents

- [ ] **Background agent service**
  - [ ] Agent runs continuously
  - [ ] Shell access
  - [ ] Cron/scheduled tasks
  - [ ] Event-driven responses

- [ ] **Agent persistence**
  - [ ] Survive restarts
  - [ ] State preservation
  - [ ] Memory retention

---

## Inherited from Phase 1 (Deferred Items)

### Authentication (Deferred to Phase 2)

- [ ] **OAuth flow support**
  - [ ] Anthropic OAuth integration
  - [ ] Google OAuth integration
  - [ ] Token refresh handling
  - [ ] Secure token storage

- [ ] **Password verification on destructive commands**
  - [ ] Verify password before delete/overwrite operations
  - [ ] Configurable sensitivity threshold

- [ ] **Failed attempt tracking**
  - [ ] Track failed login attempts
  - [ ] Store attempt timestamps
  - [ ] Reset counter on successful login

- [ ] **Lockout after 3 failed attempts**
  - [ ] Implement lockout duration (e.g., 5 minutes)
  - [ ] Lockout notification to user
  - [ ] Admin override capability

- [ ] **Reset password functionality**
  - [ ] Password reset via CLI command
  - [ ] Secure hash regeneration
  - [ ] Invalidate existing sessions

### Session Management (Deferred to Phase 2)

- [ ] **User session tracking (UUIDs)**
  - [x] Generate UUID on session start (exists)
  - [x] Store session metadata (exists)
  - [ ] Track last activity timestamp
  - [ ] Session timeout (30 minutes inactivity)
  - [ ] Explicit session end (`/exit`, `Ctrl+D`)
  - [ ] Link session to Quasar event logs

- [ ] **Session persistence**
  - [ ] Save session on end
  - [ ] Archive to Quasar
  - [ ] Cleanup expired sessions

### Model Validation (Optional)

- [ ] **Model validation on startup**
  - [ ] Quick check: provider accessible
  - [ ] Full check: model exists in provider list
  - [ ] Cache validation results (24 hour TTL)
  - [ ] Warn if validation fails (don't block)

### Messaging App Integration (Deferred)

- [ ] **Connection to messaging apps**
  - [ ] Telegram bot integration
  - [ ] WhatsApp integration
  - [ ] Unified session tracking across platforms

- [ ] **Platform-agnostic session management**
  - [ ] Same UUID system for all platforms
  - [ ] Quasar memory shared across platforms
  - [ ] User authentication per platform

### Agent & Skill Marketplace (Deferred)

- [ ] **Add Agents/Skills from repositories**
  - [ ] CLI command: `skyth install {agent_name}`
  - [ ] Download from Skyth Agent Repository (SAR)
  - [ ] Download from Skyth Skill Repository (SSR)
  - [ ] Install to `~/.skyth/agents/` or `~/.skyth/skills/`
  - [ ] Verify agent manifest
  - [ ] Update registry

---

## Phase 2 Core Requirements

### 1. Agent Registry System

#### 1.1 Manifest Loading(BIG CHANGE IN AGENT ARCHITECTURE)

- [ ] **Scan for agent manifests**
  - [ ] Scan `core/backend/agents/{name}/agent_manifest.json`
  - [ ] Support nested agent directories
  - [ ] Validate manifest schema

- [ ] **Agent manifest schema**
  - [ ] `name`: string (required)
  - [ ] `description`: string (required)
  - [ ] `version`: string
  - [ ] `type`: "generalist" | "specialized" | "subagent"
  - [ ] `capabilities`: string[]
  - [ ] `tools`: string[]
  - [ ] `subagents`: string[]
  - [ ] `max_context_tokens`: number
  - [ ] `model_preferences`: object

- [ ] **Load system prompts**
  - [ ] Read `agent.md` template files
  - [ ] Support template variables ({current_date}, {capabilities_list})
  - [ ] Cache loaded prompts

#### 1.2 Template Variable Replacement

- [ ] **Supported variables**
  - [ ] `{current_date}` - Current datetime
  - [ ] `{capabilities_list}` - Available tools list
  - [ ] `{personalization_prompt}` - User persona
  - [ ] `{agent_name}` - Agent identifier
  - [ ] `{session_id}` - Current session

- [ ] **Template resolution**
  - [ ] Resolve variables before agent execution
  - [ ] Handle missing variables gracefully
  - [ ] Support custom variables from config

#### 1.3 Per-Agent MCP Config

- [ ] **MCP config loading**
  - [ ] Scan for `mcp_config.json` in agent directory
  - [ ] Merge with global MCP config
  - [ ] Validate MCP server definitions

- [ ] **Agent-specific MCP servers**
  - [ ] Each agent can have own MCP servers
  - [ ] Isolation between agent MCP contexts
  - [ ] MCP tool availability per agent

---

### 2. Agent Architecture Implementation

#### 2.1 Built-in Agents

- [ ] **Generalist Agent** (existing: "build but needs to be user facing")
  - [x] Core implementation exists
  - [ ] Update to support full delegation

- [ ] **Plan Agent** (existing: "plan")
  - [x] Exists with read-only permissions

- [ ] **Explore Agent** (existing: "explore")
  - [x] Exists with search tools

- [ ] **Code Agent** (NEW)
  - [ ] Create `core/backend/agents/code/`
  - [ ] agent_manifest.json
  - [ ] agent.md (system prompt)
  - [ ] Tools: bash, read, edit, write, glob, grep
  - [ ] Subagents: debug, test

- [ ] **Research Agent** (NEW)
  - [ ] Create `core/backend/agents/research/`
  - [ ] agent_manifest.json
  - [ ] agent.md (system prompt)
  - [ ] Tools: web_search, web_fetch, codesearch

- [ ] **Data Agent** (NEW)
  - [ ] Create `core/backend/agents/data/`
  - [ ] agent_manifest.json
  - [ ] agent.md (system prompt)
  - [ ] Tools: bash, read, glob, csv parsing

#### 2.2 Subagent System

- [ ] **Debug Subagent**
  - [ ] Under Code Agent
  - [ ] Tools: read, grep
  - [ ] No delegation tools

- [ ] **Test Subagent**
  - [ ] Under Code Agent
  - [ ] Tools: bash, read, write
  - [ ] No delegation tools

- [ ] **Parser Subagent**
  - [ ] Under Data Agent
  - [ ] Tools: read, CSV/JSON parsers
  - [ ] No delegation tools

---

### 3. Delegation Tools

#### 3.1 Task Tool (Subagent Delegation)

- [x] **Existing implementation** (`core/backend/tools/task.ts`)
  - [x] Schema: task(description, prompt, subagent_type, task_id?)
  - [x] Creates new session for subagent
  - [x] Supports task resumption
  - [ ] Add circular call prevention
  - [ ] Add call stack tracking

#### 3.2 Delegate Tool (Agent-to-Agent)

- [ ] **Create** `core/backend/tools/delegate.ts`
  - [ ] Schema: delegate(agent: string, task: string, context_snapshot?: string)
  - [ ] Validate target agent exists
  - [ ] Validate target is not subagent
  - [ ] Create new session with parent context
  - [ ] Return agent response

- [ ] **Reference implementation**
  - [ ] `refs/tools/gemini-cli/packages/core/src/agents/delegate-to-agent-tool.ts`

#### 3.3 Progress Tool (are_we_there_yet)

- [ ] **Create** `core/backend/tools/progress.ts`
  - [ ] Schema: are_we_there_yet(task_id: string)
  - [ ] Query session state
  - [ ] Return status: pending | in_progress | complete | failed
  - [ ] Include progress percentage
  - [ ] Include ETA if available

---

### 4. Circular Call Prevention

- [ ] **Call Stack Tracking**
  - [ ] Store agent call stack in session metadata
  - [ ] Push agent on entry
  - [ ] Pop agent on exit

- [ ] **Circular Detection**
  - [ ] Check if target in stack before delegation
  - [ ] Throw CircularCallError if detected
  - [ ] Provide alternative: get previous output

- [ ] **Integration**
  - [ ] Integrate with Task tool
  - [ ] Integrate with Delegate tool
  - [ ] Test circular prevention works

---

### 5. PipelineRegistry Implementation

#### 5.1 Base Pipeline Class

- [ ] **Create** `core/backend/base/pipeline.ts`
  - [ ] Abstract BasePipeline class
  - [ ] Properties: name, description, parameters
  - [ ] Abstract execute() method
  - [ ] Support for streaming responses

#### 5.2 Pipeline Registry

- [ ] **Update** `core/backend/registries/pipeline_registry.ts`
  - [ ] Implement state with discovery
  - [ ] Scan `core/backend/pipelines/{name}/`
  - [ ] Load pipeline manifests
  - [ ] Support pipeline chaining

#### 5.3 Built-in Pipelines

- [ ] **Research Pipeline**
  - [ ] Search → Fetch → Summarize
  - [ ] Configurable steps

- [ ] **Code Analysis Pipeline**
  - [ ] Glob → Read → Analyze → Report
  - [ ] Linter integration

---

### 6. AppRegistry Implementation

#### 6.1 Base App Class

- [ ] **Create** `core/backend/base/app.ts`
  - [ ] Abstract BaseApp class
  - [ ] Properties: name, description, ui_component
  - [ ] Abstract render() method

#### 6.2 App Registry

- [ ] **Update** `core/backend/registries/app_registry.ts`
  - [ ] Implement state with discovery
  - [ ] Scan `core/backend/apps/{name}/`
  - [ ] Load app manifests

#### 6.3 Built-in Apps (Future)

- [ ] YouTube app (deferred)
- [ ] Spotify app (deferred)
- [ ] Wikipedia app (deferred)

---

### 7. Gateway Implementation

#### 7.1 API Gateway

- [ ] **Create** `core/backend/gateway/index.ts`
  - [ ] Request routing
  - [ ] Rate limiting
  - [ ] Authentication middleware
  - [ ] Logging

#### 7.2 Agent Gateway

- [ ] **Agent execution endpoint**
  - [ ] POST /api/v1/agents/execute
  - [ ] WebSocket support for streaming
  - [ ] Session management

#### 7.3 Tool Gateway

- [ ] **Tool invocation endpoint**
  - [ ] POST /api/v1/tools/invoke
  - [ ] Tool registry integration
  - [ ] Result formatting

---

### 8. Additional Phase 2 Tools

#### 8.1 Context Tools

- [ ] **get_agent_output**
  - [ ] Schema: get_agent_output(agent: string, task_id: string)
  - [ ] Retrieve previous agent results
  - [ ] Cache management

- [ ] **request_generalist**
  - [ ] Schema: request_generalist(reason: string, question: string)
  - [ ] Escalate to generalist agent
  - [ ] Pass context

#### 8.2 Session Tools

- [ ] **Session management tools**
  - [ ] List sessions
  - [ ] Resume session
  - [ ] Archive session

---

## Phase 2 Completion Criteria

### Must Have (Required)

1. [ ] Agent registry with manifest loading
2. [ ] Template variable replacement
3. [ ] At least 3 specialized agents (code, research, data)
4. [ ] Delegate tool implemented
5. [ ] Progress tool implemented
6. [ ] Circular call prevention working
7. [ ] PipelineRegistry functional
8. [ ] Gateway API functional

### Should Have (Nice to Have)

9. [ ] Per-agent MCP config
10. [ ] Subagent implementations
11. [ ] OAuth flow support
12. [ ] Session management improvements

### Won't Have (Phase 3+)

- Full AppRegistry (UI widgets) → Phase 3+
- Messaging app integration → Phase 3+
- Agent marketplace → Phase 3+

---

## Implementation Order

### Week 1-2: Agent Registry Foundation

1. Agent manifest schema
2. Manifest loading system
3. Template variable replacement
4. Update AgentRegistry

### Week 3-4: Delegation Tools

5. Delegate tool implementation
6. Progress tool implementation
7. Circular call prevention
8. Update Task tool with prevention

### Week 5-6: Specialized Agents

9. Code agent implementation
10. Research agent implementation
11. Data agent implementation
12. Subagent implementations

### Week 7-8: Pipeline & App Registries

13. BasePipeline abstract class
14. PipelineRegistry implementation
15. BaseApp abstract class
16. AppRegistry implementation

### Week 9-10: Gateway & Integration

17. Gateway implementation
18. API endpoints
19. Integration testing
20. OAuth flow (if time permits)

---

## Testing Requirements

### Unit Tests

- [ ] Agent manifest validation
- [ ] Template variable resolution
- [ ] Delegate tool execution
- [ ] Circular call detection
- [ ] Pipeline execution

### Integration Tests

- [ ] Agent-to-agent delegation
- [ ] Subagent spawning
- [ ] Progress checking
- [ ] Gateway API endpoints

### End-to-End Tests

- [ ] Complete delegation flow
- [ ] Multi-agent task completion
- [ ] Error recovery

---

## Edge Cases

### Edge Case 1: Agent Not Found

**Scenario:** Delegate tool called with non-existent agent  
**Expected:** Clear error message listing available agents  
**Implementation:** Validate agent exists before creating session

### Edge Case 2: Circular Call Detected

**Scenario:** Agent A calls Agent B, Agent B tries to call Agent A  
**Expected:** CircularCallError with suggestion to use get_agent_output  
**Implementation:** Check call stack before delegation

### Edge Case 3: Subagent Tries to Delegate

**Scenario:** Subagent attempts to use delegate or task tool  
**Expected:** Permission denied error  
**Implementation:** Check agent type before allowing delegation

### Edge Case 4: Session Timeout During Delegation

**Scenario:** Parent session times out while subagent running  
**Expected:** Subagent continues, parent can resume  
**Implementation:** Independent session lifecycle

### Edge Case 5: MCP Config Conflict

**Scenario:** Agent has MCP config that conflicts with global  
**Expected:** Agent config takes precedence, warning logged  
**Implementation:** Merge with agent config winning

### Edge Case 6: Template Variable Missing

**Scenario:** Template references undefined variable  
**Expected:** Variable replaced with empty string, warning logged  
**Implementation:** Graceful fallback in resolution

### Edge Case 7: Parallel Delegation Race

**Scenario:** Multiple agents delegate to same target simultaneously  
**Expected:** Each gets separate session, no conflicts  
**Implementation:** Session isolation

### Edge Case 8: Tool Not Available for Agent

**Scenario:** Agent tries to use tool not in its manifest  
**Expected:** Tool not visible or permission denied  
**Implementation:** Tool filtering by agent permissions

---

## Dependencies

### External Libraries

- `zod` - Schema validation (already in use)
- `ai` - Vercel AI SDK (already in use)
- `remeda` - Utility functions (already in use)

### Internal Modules

- `@/agents/agent` - Agent definitions
- `@/registries/agent_registry` - Agent registry
- `@/tools/tool` - Tool base
- `@/session` - Session management

---

## References

- Old agent registry: `refs/apps/Skyth/skyth-old/backend/agent_registry.py`
- Base classes: `refs/apps/Skyth/skyth-old/backend/base_*.py`
- Delegate tool ref: `refs/tools/gemini-cli/packages/core/src/agents/delegate-to-agent-tool.ts`
- Agent architecture: `spec/phase-2/agent-architecture.md`

---

## Definition of Done

Phase 2 is complete when:

1. [ ] Agent registry loads from manifests
2. [ ] Template variables resolve correctly
3. [ ] 3+ specialized agents exist and are functional
4. [ ] Delegate tool works (agent-to-agent)
5. [ ] Progress tool works (are_we_there_yet)
6. [ ] Circular call prevention prevents loops
7. [ ] PipelineRegistry has at least one pipeline
8. [ ] Gateway API handles requests
9. [ ] All core tests pass
10. [ ] Documentation updated

**Current Progress:** 0% Complete  
**Estimated Completion:** 12 weeks
