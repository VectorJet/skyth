# Handoff: File Split Refactoring (2026-05-22)

## What Changed

Three files over 400 LOC were split into focused modules:

### 1. `skyth/base/base_agent/runtime/agent_loop_runner.ts`
**Before:** 401 LOC | **After:** 335 LOC

Extracted to `skyth/base/base_agent/runtime/agent_loop_recovery.ts`:
- `MAX_PROVIDER_ERROR_RECOVERY_ATTEMPTS`, `TOOL_FALLBACK_LINES`, `RETRY_INITIAL_DELAY`, `RETRY_BACKOFF_FACTOR`, `RETRY_MAX_DELAY`
- `sleep()`, `isRateLimitError()`, `isProviderErrorContent()`, `formatToolFallback()`, `degradedModeFallback()`

### 2. `skyth/gateway/meta/tools/execute_tool.ts`
**Before:** 402 LOC | **After:** 121 LOC

Extracted to `skyth/gateway/meta/tools/execute_tool_handler.ts`:
- The massive `executeToolTool` definition (~280 lines) with its MCP/pipeline/skill/async handler
- Module-level service setters for the handler's tool registry, pipeline registry, MCP registry, skill registry, and runners

**Note:** `execute_tool.ts` re-exports from `execute_tool_handler.ts`. The handler also imports `executeToolDirect` from `execute_tool.ts`, creating a circular dependency. This works at runtime because `executeToolDirect` is only called inside the handler function body (lazy, at runtime), not during module initialization.

### 3. `skyth/gateway/meta/tools/manager.ts`
**Before:** 410 LOC | **After:** 342 LOC

Extracted to `skyth/gateway/meta/tools/manager/setup.ts`:
- `reloadMetaToolModules()`, `prepareMetaReloadRoot()`, `copyReloadTree()`, `configureMetaToolModules()`
- `MetaToolModuleState` interface for tracking meta-module state
- `MetaToolsManager` delegates to these via a `metaModuleState: MetaToolModuleState` field

## Import Changes

- `agent_loop_runner.ts` now imports recovery helpers from `agent_loop_recovery.ts`
- `execute_tool.ts` re-exports from `execute_tool_handler.ts` for barrel export compatibility
- `manager.ts` imports from `manager/setup.ts` instead of having private inline methods

## Verification

- `bun run typecheck` passes
- `bun test tests/` passes — 110 tests, 0 failures
- `./scripts/loc_check.sh` — 0 files >= 400 LOC
