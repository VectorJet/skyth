# Progress - 2026-05-24

## Current Focus

Pi migration phase three. Skyth now installs the real Pi packages and defaults the backend provider path to Pi while keeping the existing `LLMProvider`/`StepRunner` orchestration boundary intact.

## Completed

### Pi Dependencies

- Added `@earendil-works/pi-ai@0.75.5`.
- Added `@earendil-works/pi-agent-core@0.75.5`.
- Updated `bun.lock` through `bun add`.

### Real Pi Provider Wiring

- Replaced local Pi adapter type mirrors in `skyth/pi/types.ts` with direct type aliases from `@earendil-works/pi-ai`.
- Added `piStreamSimpleEngine` in `skyth/pi/factory.ts`, backed by Pi `getModel()` and `streamSimple()`.
- `createPiProvider()` now injects the real Pi stream engine by default while still accepting a test/custom engine override.
- `PiProvider` now passes Skyth stream callbacks through Pi stream events and returns completed Pi assistant messages as Skyth `LLMResponse`s.
- `api_base` is mapped by overriding the selected Pi model `baseUrl` for compatibility with existing Skyth provider config.

### Gateway, Quasar, and Onboarding Path

- `runtime.useProvider` now defaults to `"pi"` in `skyth/config/schema.ts`.
- `buildGatewayAgentSession()` passes env/config `api_key` and `api_base` into `createPiProvider()` when the Pi runtime is active.
- CLI provider construction still supports the old AI SDK path when `runtime.useProvider` is explicitly set to `"ai-sdk"`.
- `skyth configure provider` now routes new provider API keys through the Quasar-backed `setProviderApiKey()` helper instead of writing new plaintext provider keys into config.
- Onboarding now persists `runtime.useProvider = "pi"` and routes primary provider API keys through the same Quasar-backed helper.
- The remaining configure command import now goes through `skyth/pi/catalog` instead of `skyth/providers/registry`.

### Tests

- Existing Pi adapter tests continue to cover model, message, tool, response, and stream event conversion.
- `tests/pi_provider_step_runner.test.ts` verifies the existing `AgentRunOrchestrator` can complete a gateway turn through `PiProvider`.

## Verification

- `bun run typecheck` passes.
- `bun test tests/` passes 166 tests.
- `bun run build:bin` succeeds.

## Recommended Next Step

1. Add a real Pi SDK integration test using Pi's faux provider or a small registered test model path, so the default `piStreamSimpleEngine` is exercised without external network credentials.
2. Move session routing/naming helpers in `skyth/base/base_agent/session/core/router/*` from the legacy provider abstraction to Pi completion calls.
3. Replace `AgentLoop` / `processMessageWithRuntime` with Pi agent/session semantics from `@earendil-works/pi-agent-core`.
4. Move provider/model catalog reads from the legacy `models.dev` registry shim to Pi `getProviders()` / `getModels()` once onboarding UX parity is confirmed.
5. Remove `skyth/providers/*` after channel, gateway, router, and CLI paths no longer import it.
