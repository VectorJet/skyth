# Base Agent + Agent SDK -- Implementation Checklist

**Status:** Phase 0 Complete, Phase 1 Started
**Date:** 2026-03-02
**Spec:** `specs/base-agent-sdk/spec.md`

---

## Phase 0: Create Agent Namespace

- [x] Create `skyth/agents/agents.ts` -- Agent namespace with `Agent.list()`, `Agent.get()`, `Agent.Info`
- [x] Resolves existing `@/agent/agent` import used by `skyth/tools/task.ts`, `skyth/tools/tool.ts`, `skyth/tools/registry.ts`, `skyth/tools/truncation.ts`
- [x] Run typecheck to verify imports resolve: `bun run typecheck`

---

## Phase 1: Create base_agent (Extract from Generalist)

### 1.1 Directory Setup
- [x] Create `skyth/base/base_agent/` directory structure (note: base/base_agent per user request)
- [x] Create `skyth/base/base_agent/index.ts` with public exports
- [x] Create `skyth/base/base_agent/types.ts` with shared types
- [ ] Create `skyth/base/base_agent/runtime.ts` -- implement lean agent loop
- [ ] Create `skyth/base/base_agent/lifecycle.ts` -- init, start, stop, destroy

### 1.2 Context Module (`base_agent/context/`)
- [x] Create stub `builder.ts` with ContextModule class
- [ ] Extract `identity.ts` -- identity/persona loading (IDENTITY.md, USER.md, SOUL.md)
- [ ] Extract `platform.ts` -- platform output adaptation (Telegram, Discord, CLI, etc.)
- [ ] Extract `tone.ts` -- tone mirroring analysis
- [ ] Verify all context building still produces equivalent system prompts

### 1.3 Memory Module (`base_agent/memory/`)
- [x] Create stub `store.ts` with MemoryModule class
- [ ] Extract consolidation logic from loop.ts -- background consolidation
- [ ] Create mental_image.ts -- behavioral observation tracking
- [ ] Verify memory read/write still works correctly

### 1.4 Session Module (`base_agent/session/`)
- [x] Create stub `handler.ts` with SessionModule class
- [ ] Create `merge.ts` -- cross-channel merge routing from loop.ts (depends on LLMProvider for MergeRouter classification)
- [ ] Create `bridge.ts` -- sticky bridge continuation from loop.ts
- [ ] Verify session lifecycle remains intact

### 1.5 Delegation Module (`base_agent/delegation/`)
- [x] Create stub `manager.ts` with DelegationModule class
- [ ] Implement `call_stack.ts` -- circular call prevention (Phase 2 spec)
- [ ] Create `types.ts` -- delegation types
- [ ] Test circular call detection
- [ ] Test 2-level nesting enforcement

### 1.6 Tool Module (`base_agent/tools/`)
- [x] Create stub `registry.ts` with ToolModule class
- [ ] Implement `loader.ts` -- file scanner for `*_tool.{ts,py,...}` and `*_tool/` dirs
- [ ] Implement `metadata.ts` -- JSDoc-style header metadata parser
- [ ] Implement `first_use.ts` -- first-use source code injection for security
- [ ] Create `types.ts` -- ToolMetadata, ToolEntry, ToolScope interfaces
- [ ] Test auto-discovery with sample tools
- [ ] Test metadata parsing with various file types
- [ ] Test first-use review injection

### 1.7 Skills Module (`base_agent/skills/`)
- [x] Create stub `loader.ts` with SkillsModule class
- [ ] Create `types.ts` -- SkillEntry, SkillMeta interfaces
- [ ] Verify skill loading (workspace + builtin), always-on skills, and summary generation

### 1.8 Onboarding Module (`base_agent/onboarding/`)
- [x] Create stub `bootstrap.ts` with OnboardingModule class
- [ ] Create `identity_check.ts` -- missing field detection from loop.ts
- [ ] Verify onboarding flow remains correct

### 1.9 Runtime (`base_agent/runtime.ts`)
- [ ] Implement lean agent loop: build messages -> call LLM -> execute tools -> repeat
- [ ] Wire all modules into runtime via config
- [ ] Implement loop detection (repeated tool calls)
- [ ] Implement output sanitization (strip think tags, leaked tool calls)
- [ ] Implement max iteration guard
- [ ] Implement streaming support

### 1.10 Lifecycle (`base_agent/lifecycle.ts`)
- [ ] Implement init, start, stop, destroy hooks
- [ ] Wire lifecycle into runtime

### 1.11 Validation
- [ ] Run existing tests: `bun test tests/`
- [ ] Run typecheck: `bun run typecheck`
- [ ] Verify no regressions in agent behavior

---

## Phase 2: Create Agent SDK (`sdks/agent-sdk/`)

### 2.1 Directory Setup
- [ ] Create `skyth/sdks/agent-sdk/` directory structure
- [ ] Create `skyth/sdks/agent-sdk/index.ts` -- public API exports

### 2.2 Core SDK
- [ ] Implement `define.ts` -- `defineAgent()` factory function
- [ ] Implement `tools.ts` -- `defineTool()` helper function
- [ ] Implement `pipeline.ts` -- `definePipeline()` helper function
- [ ] Implement `types.ts` -- all SDK types (AgentDefinition, ToolDefinition, etc.)

### 2.3 Manifest & Permissions
- [ ] Implement `manifest.ts` -- agent manifest schema validation (extends core/manifest.ts)
- [ ] Implement `permissions.ts` -- global tool access resolution

### 2.4 Lifecycle Hooks
- [ ] Implement `hooks.ts` -- lifecycle hook types (onInit, onStart, onMessage, etc.)

### 2.5 Provide Agent Namespace
- [ ] Implement `Agent.list()` -- list all registered agents
- [ ] Implement `Agent.get(id)` -- get agent by ID
- [ ] Implement `Agent.Info` interface -- agent metadata type
- [ ] Wire into existing `skyth/tools/task.ts` imports from `@/agent/agent`

### 2.6 Validation
- [ ] Write unit tests for defineAgent()
- [ ] Write unit tests for defineTool()
- [ ] Write unit tests for manifest validation
- [ ] Write unit tests for permissions resolution
- [ ] Run typecheck: `bun run typecheck`

---

## Phase 3: Rebuild Generalist Agent

### 3.1 Core Tools Migration
- [ ] Move `filesystem.ts` (read/write/edit/list_dir) to global `skyth/tools/` as `*_tool.ts` files
- [ ] Move `shell.ts` (exec) to global `skyth/tools/` as `exec_tool.ts`
- [ ] Move `web.ts` (web_fetch) to global `skyth/tools/` as `webfetch_tool.ts`
- [ ] Add required `@tool`, `@author`, `@description` metadata headers to all migrated tools

### 3.2 New Generalist
- [ ] Create `skyth/agents/generalist_agent/agent_manifest.json`
- [ ] Create `skyth/agents/generalist_agent/index.ts` using `defineAgent()`
- [ ] Move agent-specific tools to `tools/` with `*_tool.ts` naming:
  - [ ] `message_tool.ts` (from tools/message.ts)
  - [ ] `spawn_tool.ts` (from tools/spawn.ts)
  - [ ] `cron_tool.ts` (from tools/cron.ts)
  - [ ] `session_tool/` (from tools/session-tools.ts)
- [ ] Create empty `pipelines/`, `apps/`, `mcps/` directories
- [ ] Update `skyth/agents/system.ts` to use new createAgent()

### 3.3 Cleanup
- [ ] Remove old generalist agent code from base_agent (after migration verified)
- [ ] Update all imports referencing old paths
- [ ] Remove any dead code

### 3.4 Final Validation
- [ ] Run full test suite: `bun test tests/`
- [ ] Run typecheck: `bun run typecheck`
- [ ] Manual smoke test: verify agent responds correctly
- [ ] Verify subagent spawning works
- [ ] Verify cross-channel merging works
- [ ] Verify memory consolidation works
- [ ] Verify onboarding flow works

---

## Phase 4: Documentation & Cleanup

- [ ] Update AGENTS.md with new architecture details
- [ ] Update specs/progress/Progress.md
- [ ] Create handoff notes for any incomplete work
- [ ] Document SDK API in README or docs
- [ ] Archive old generalist agent code to legacy/.trash if needed

---

## Key Files to Modify/Create

### New Files
- `skyth/agent/agent.ts` (Agent namespace) -- NOTE: Created at `skyth/agents/agents.ts` instead
- `skyth/base/base_agent/**` (entire directory)
- `skyth/sdks/agent-sdk/**` (entire directory)
- `skyth/agents/generalist_agent/index.ts` (new, SDK-based)
- `skyth/agents/generalist_agent/tools/*_tool.ts` (renamed agent-specific tools)
- Global tools migrated to `skyth/tools/*_tool.ts` (filesystem, shell, web)

### Modified Files
- `skyth/agents/system.ts` -- update createAgent()
- `skyth/registries/agent_registry.ts` -- may need updates for new structure
- `skyth/registries/tool_registry.ts` -- integrate with new tool loader
- `tsconfig.json` -- add path aliases if needed

### Files to Remove (after migration)
- `skyth/agents/generalist_agent/loop.ts` (old)
- `skyth/agents/generalist_agent/context.ts` (old)
- `skyth/agents/generalist_agent/memory.ts` (old)
- `skyth/agents/generalist_agent/skills.ts` (old)
- `skyth/agents/generalist_agent/subagent.ts` (old)
- `skyth/agents/generalist_agent/tools/base.ts` (old)
- `skyth/agents/generalist_agent/tools/registry.ts` (old)
- All old tool files in `skyth/agents/generalist_agent/tools/`

---

_Date: 2026-03-02_
