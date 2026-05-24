# Handoff - Pi Provider Gateway Wiring

Date: 2026-05-24

## Summary

Completed the wiring of the `PiProvider` into the gateway runtime, Quasar, and onboarding logic. This fulfills the next slice of the migration plan to transition the Skyth backend to a Pi-backed runtime.

## Changes Made

- **`skyth/config/schema.ts`**:
  - Introduced the `runtime.useProvider` configuration flag typed as `"pi" | "ai-sdk"`, defaulting to `"ai-sdk"`. This avoids a breaking change while providing an incremental toggle.
- **`skyth/gateway/lifecycle/agent-session-boot.ts`**:
  - Replaced tight coupling to `AISDKProvider` with generic `LLMProvider` abstractions in `AgentSessionBootInput` and `AgentSessionBootResult`.
  - Updated `buildGatewayAgentSession` to construct `PiProvider` using `createPiProvider()` when `runtime.useProvider === "pi"`.
  - Updated legacy `providers/registry` imports to use `pi/catalog`.
- **`skyth/cli/runtime/helpers/providers.ts`**:
  - Generalized `makeProviderFromConfig` to return an `LLMProvider` and instantiate the `PiProvider` based on the new `runtime.useProvider` flag, ensuring CLI tools seamlessly bridge credentials to the new Pi provider setup.
- **`tests/pi_provider_step_runner.test.ts`**:
  - Added an integration test verifying the `AgentRunOrchestrator` successfully maps Pi's stream events into Skyth's `StepRunResult` using a mocked `PiStreamEngine` shaped exactly like Pi's `faux` provider.

## Verification

- `bun run typecheck` returned successfully.
- `bun test tests/` passed 166 tests completely seamlessly. The previous gateway timeout issues from the baseline branch did not recur.

## Next Steps

1. Install `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` (either via npm or workspace path from `vendor/pi`).
2. Replace local mirrors in `skyth/pi/types.ts` with direct re-exports from `@earendil-works/pi-ai`.
3. Migrate session routing/naming helpers in `skyth/base/base_agent/session/core/router/*` to Pi completion calls.
4. Replace `AgentLoop` / `processMessageWithRuntime` entirely with Pi agent/session semantics.
5. After all channels and gateways no longer depend on legacy logic, delete `skyth/providers/*`.
