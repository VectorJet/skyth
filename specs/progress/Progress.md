# Progress - 2026-05-24

## Current Focus

Fixed the broken AgentRunOrchestrator/SkythAgentSession tests after the Pi runtime bridge migration.

## Completed

### Skyth Provider Compatibility in Pi Bridge

- Restored support for injected providers that implement the Skyth `LLMProvider.chat()` contract but do not expose a Pi `getEngine()`.
- Added conversion from Pi agent context/tools back to Skyth OpenAI-style chat parameters for compatibility providers.
- Wrapped Skyth `LLMResponse` values as Pi assistant messages so the Pi agent loop can continue executing tool calls and producing final output.
- Kept the existing Pi engine and `streamSimple()` paths intact.

### Message Conversion Robustness

- Made `toSkythMessages()` skip empty message slots, preventing sparse Pi message state from throwing during session-end memory/plugin conversion.

## Verification

- `bun test tests/` passes 160 tests.
- `bun run typecheck` passes.
- Targeted regression tests pass:
  - `tests/gateway_tool_runtime_injection.test.ts`
  - `tests/agent_orchestrator_memory.test.ts`
  - `tests/agent_orchestrator_run_events.test.ts`
  - `tests/gateway_boot_wiring.test.ts`
  - `tests/pi_provider_step_runner.test.ts`
- `./scripts/loc_check.sh` ran and reports one existing file over 400 LOC: `skyth/base/base_agent/runtime/orchestrator.ts` at 574 LOC. This test fix did not split it to avoid mixing a broad refactor into the regression fix.

## Remaining Work

1. Split `skyth/base/base_agent/runtime/orchestrator.ts` into focused modules to satisfy the LOC policy.
2. Continue shrinking files close to 400 LOC, especially `skyth/base/base_agent/runtime/bridge.ts` before adding more behavior there.
3. Continue the Pi migration cleanup by removing AI SDK fallback paths once `runtime.useProvider = "ai-sdk"` is no longer required.
