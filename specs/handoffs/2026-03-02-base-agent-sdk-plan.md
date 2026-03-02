# Handoff: Base Agent + Skyth Agent SDK Plan

**Date:** 2026-03-02
**Status:** Planning complete, implementation not started
**Branch:** experiment/agents

---

## Summary

Completed planning phase for decomposing the monolithic generalist agent into a modular **baseAgent** runtime and a developer-facing **agent-sdk**. All specification documents, architecture details, tool conventions, and implementation checklists have been created.

## What Was Done

1. **Analyzed current codebase:**
   - Read all generalist agent files: `loop.ts` (~600 lines), `context.ts`, `memory.ts`, `skills.ts`, `subagent.ts`, `tools/base.ts`, `tools/registry.ts`
   - Read legacy specs: `legacy/.trash/spec/phase-2/agent-architecture.md`, `legacy/.trash/spec/arch.md`, `legacy/.trash/spec/spec.md`
   - Identified two parallel tool systems: old `Tool` abstract class + newer `Tool.define()` pattern
   - Mapped all imports and dependencies

2. **Created specifications:**
   - `specs/base-agent-sdk/spec.md` -- Full specification: directory structure, module decomposition, SDK API, delegation hierarchy, migration path
   - `specs/base-agent-sdk/architecture.md` -- Module interfaces, call stack tracking, discovery flows, composition model
   - `specs/base-agent-sdk/tool-conventions.md` -- Tool auto-discovery: naming (`*_tool.ts`), metadata headers, first-use security review, scan directories
   - `specs/base-agent-sdk/todo.md` -- Implementation checklist organized in 4 phases with all tasks

## Key Architecture Decisions

1. **baseAgent location:** `skyth/baseAgent/` -- generalist agent code moves here and is decomposed into modules
2. **SDK location:** `skyth/sdks/agent-sdk/` -- provides `defineAgent()`, `defineTool()`, `definePipeline()`
3. **New agents location:** `skyth/agents/` -- self-contained agents built with the SDK
4. **Tool naming:** `*_tool.{ts,py,...}` files and `*_tool/` directories with `index.ts`
5. **Tool metadata:** JSDoc-style `@tool`, `@author`, `@description` headers required
6. **First-use security:** Auto-discovered tools have source injected as system message on first call per session
7. **Global tool access:** Controlled via `global_tools` field in `agent_manifest.json`; agents without it must use `delegate` tool
8. **Delegation:** 3-tier hierarchy (Generalist -> Specialized Agents -> Subagents) with circular call prevention

## Important Context for Next Agent

### Two Parallel Tool Systems Exist

The codebase has TWO tool systems that need to be unified:

1. **Old system** (in `skyth/agents/generalist_agent/tools/`):
   - `base.ts` -- abstract `Tool` class with `name`, `description`, `parameters`, `execute()`
   - `registry.ts` -- `ToolRegistry` class with `register()`, `execute()`, `getDefinitions()`
   - Used by the generalist agent's loop.ts

2. **Newer system** (in `skyth/tools/`):
   - `tool.ts` -- `Tool.define()` with Zod schemas, namespaced pattern
   - `registry.ts` -- `ToolRegistry` namespace with plugin support
   - `task.ts` -- imports from `@/agent/agent` which does not exist yet in the tree
   - Appears to be partially ported from opencode/refs

The new baseAgent tool system should provide the `Agent` namespace (`Agent.list()`, `Agent.get()`, `Agent.Info`) that `skyth/tools/task.ts` already imports from `@/agent/agent`.

### Files That Import from Generalist Agent

Before moving/deleting the old generalist agent, check and update imports in:
- `skyth/agents/system.ts` -- imports `AgentLoop` from `@/agents/generalist_agent/loop`
- `skyth/registries/tool_registry.ts` -- imports `Tool`, `ToolRegistry` from `@/agents/generalist_agent/tools/`
- Any test files referencing generalist agent paths

### The `@/agent/agent` Import Gap

`skyth/tools/task.ts`, `skyth/tools/tool.ts`, `skyth/tools/registry.ts`, and `skyth/tools/truncation.ts` all import from `@/agent/agent` which does not exist. This needs to be created as part of the SDK work -- it should expose the `Agent` namespace with `list()`, `get()`, and `Info` interface.

## Implementation Order

1. **Phase 1:** Create `skyth/baseAgent/` -- extract and modularize from current generalist
2. **Phase 2:** Create `skyth/sdks/agent-sdk/` -- build defineAgent/defineTool API on top of baseAgent
3. **Phase 3:** Create new `skyth/agents/generalist_agent/` -- rebuild using SDK
4. **Phase 4:** Delete old code, update docs

## Files Created

- `specs/base-agent-sdk/spec.md`
- `specs/base-agent-sdk/architecture.md`
- `specs/base-agent-sdk/tool-conventions.md`
- `specs/base-agent-sdk/todo.md`
- `specs/handoffs/2026-03-02-base-agent-sdk-plan.md` (this file)
- `specs/progress/Progress.md` (overwritten)

## Next Steps

1. Start Phase 1: Create `skyth/baseAgent/` directory and begin extracting modules from the generalist agent
2. Start with the least-dependent modules first: `types.ts`, `context/`, then `memory/`, `session/`, `delegation/`, `tools/`, `onboarding/`
3. Build `runtime.ts` last as it composes all modules
4. Run `bun run typecheck` and `bun test tests/` after each extraction to catch regressions

---

_This task is NOT complete. Implementation has not started._
