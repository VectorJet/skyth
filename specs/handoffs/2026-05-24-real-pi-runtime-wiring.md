# Handoff - Real Pi Runtime Wiring

Date: 2026-05-24

## Summary

Installed the real Pi dependencies and wired Skyth's current gateway/provider path to use Pi by default. This remains an incremental migration: the existing Skyth `LLMProvider`, `AgentRunOrchestrator`, and gateway session flow still own orchestration, while Pi now owns the model call through `streamSimple()`.

## Changes Made

- **Dependencies**
  - Added `@earendil-works/pi-ai@0.75.5`.
  - Added `@earendil-works/pi-agent-core@0.75.5`.

- **`skyth/pi/types.ts`**
  - Replaced local mirror interfaces with type aliases from `@earendil-works/pi-ai`.

- **`skyth/pi/factory.ts`**
  - Added `piStreamSimpleEngine`, which resolves Pi models with `getModel()` and streams through `streamSimple()`.
  - `createPiProvider()` now uses the real engine by default and still supports injected engines for tests.
  - Existing `api_base` config is preserved by overriding the selected Pi model `baseUrl`.

- **`skyth/pi/provider.ts`**
  - Added credential override support for gateway env/config credentials.
  - Merges configured headers with credential-store headers before invoking the Pi engine.

- **Gateway Runtime**
  - `runtime.useProvider` now defaults to `"pi"`.
  - `buildGatewayAgentSession()` passes `api_key` and `api_base` into `createPiProvider()` for the Pi path.

- **Quasar / Onboarding / Configure**
  - `skyth configure provider` now writes new API keys through `setProviderApiKey()`.
  - Onboarding writes provider API keys through the same Quasar-backed helper and persists `runtime.useProvider = "pi"`.
  - Configure command provider catalog access now imports from `skyth/pi/catalog`.

## Verification

```bash
bun run typecheck
bun test tests/
bun run build:bin
```

All passed. Full test suite result: 166 passing tests, 0 failures.

## Important Notes

- The real Pi engine is now the default path, but the test coverage still exercises `PiProvider` with an injected faux-shaped engine. A no-network test for `piStreamSimpleEngine` itself should be added next.
- The provider/model catalog is still shimmed through `skyth/pi/catalog`, which currently re-exports the legacy `models.dev` registry. Migrating that shim to Pi `getProviders()` / `getModels()` is still pending.
- The old `skyth/providers/*` stack is still required for the compatibility boundary and AI SDK fallback.

## Next Steps

1. Add a direct `piStreamSimpleEngine` test.
2. Port session router/naming helpers to Pi completion calls.
3. Replace the legacy agent loop/message processor with `@earendil-works/pi-agent-core` semantics.
4. Remove the legacy provider registry after all imports have moved behind Pi or direct Pi calls.
