# Handoff - 2026-05-24 Test Fix Provider Bridge

## Summary

Fixed broken tests caused by the Pi runtime bridge only using Pi engines or `streamSimple()`. Tests with injected Skyth `LLMProvider.chat()` providers were never called, causing missing tool execution, error finish events, and memory/session failures.

## Changes

- Updated `skyth/base/base_agent/runtime/bridge.ts`.
- Added a compatibility path in `createStreamFn()` for providers with `chat()`.
- Converted Pi context messages/tools into Skyth chat messages and OpenAI-style function tool schemas.
- Converted Skyth `LLMResponse` back into a Pi assistant message and terminal stream event.
- Made `toSkythMessages()` skip empty message slots.

## Verification

- `bun test tests/` passes 160 tests.
- `bun run typecheck` passes.
- `./scripts/loc_check.sh` ran.

## Notes

- `./scripts/loc_check.sh` reports `skyth/base/base_agent/runtime/orchestrator.ts` at 574 LOC. This appears pre-existing in the current working tree and still needs a focused split.
- `skyth/base/base_agent/runtime/bridge.ts` is now 378 LOC, so avoid adding more behavior there before extracting focused helpers.
