# Handoff - Pi Catalog Router Runtime

Date: 2026-05-24

## Summary

Completed the next Pi migration slice after real provider wiring. The provider/model catalog now comes from Pi, router/naming calls use Pi completion helpers, and the old `skyth/providers/registry.ts` file has been removed.

## Changes Made

- Added `skyth/pi/completion.ts` for direct Pi `completeSimple()` text completion calls.
- Added `skyth/pi/llm-provider.ts` as the Pi-owned compatibility provider contract.
- Converted `skyth/providers/base.ts` into a compatibility re-export shim.
- Replaced `skyth/pi/catalog.ts` with a Pi-backed implementation using `getProviders()` and `getModels()`.
- Updated AI SDK fallback internals to read catalog helpers from `skyth/pi/catalog` instead of the deleted registry.
- Updated merge routing and session naming to use `PiTextCompletionClient`.
- Added `tests/pi_stream_simple_engine.test.ts` to exercise the default `piStreamSimpleEngine` against Pi's faux provider without network credentials.

## Verification

```bash
bun run typecheck
bun test tests/
bun run build:bin
./scripts/loc_check.sh
```

All passed. Test suite result: 167 passing tests, 0 failures. LOC check reports 0 files >= 400 LOC.

## Notes

- `skyth/providers/*` still contains the explicit AI SDK fallback path. It is no longer the catalog owner.
- The older `AgentLoop` / `processMessageWithRuntime` channel path still exists and still calls the Skyth loop runner. The gateway path already uses `SkythAgentSession` / `AgentRunOrchestrator`.
- A full switch to `@earendil-works/pi-agent-core` should be done as a dedicated slice because it affects channel message persistence, streaming events, plugin hooks, memory synchronization, and tool execution semantics.
