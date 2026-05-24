# Progress - 2026-05-24

## Current Focus

Pi migration phase four. Skyth's default backend path now uses Pi for provider calls, router/naming completion helpers, and provider/model catalog reads. The old `models.dev` registry file has been removed, and the provider contract now lives under `skyth/pi`.

## Completed

### Direct Pi Runtime Coverage

- Added a no-network `piStreamSimpleEngine` test using Pi's faux provider registration.
- Kept injected-engine coverage for `AgentRunOrchestrator` through `PiProvider`.
- Added a guarded faux model fallback inside `piStreamSimpleEngine` so Pi's faux API registration can exercise the real `streamSimple()` call path.

### Router and Naming Pi Completion

- Added `skyth/pi/completion.ts` with `completePiText()` and `createPiCompletionClient()`.
- Updated cross-channel merge classification and session naming to use the Pi completion client contract instead of `LLMProvider.chat()`.
- `AgentLoop` now constructs a Pi completion client for router/naming helpers.

### Pi-Owned Provider Contract

- Added `skyth/pi/llm-provider.ts` as the canonical Skyth provider contract during the migration.
- Changed `skyth/providers/base.ts` into a compatibility re-export shim.
- Updated active runtime and Pi modules to import provider types from the Pi-owned contract where practical.

### Pi Catalog

- Replaced `skyth/pi/catalog.ts` re-exports from the old registry with a Pi-backed catalog built from `getProviders()` and `getModels()`.
- Preserved the existing catalog API shape used by onboarding, configure, status, gateway boot, and the AI SDK fallback.
- Removed `skyth/providers/registry.ts`.

## Verification

- `bun run typecheck` passes.
- `bun test tests/` passes 167 tests.
- `bun run build:bin` succeeds.
- `./scripts/loc_check.sh` reports 0 files >= 400 LOC.

## Remaining Work

1. Replace the older channel `AgentLoop` / `processMessageWithRuntime` path with the newer `SkythAgentSession`/`AgentRunOrchestrator` path, or port that path fully to `@earendil-works/pi-agent-core`.
2. Remove the AI SDK fallback files under `skyth/providers/*` once `runtime.useProvider = "ai-sdk"` is no longer required.
3. Continue shrinking files currently near 400 LOC before adding new behavior to them.
