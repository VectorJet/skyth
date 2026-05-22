# Handoff: Quasar-before-MCP boot order and batch_tools schema

## Summary

This slice addresses the live gateway failure where Quasar memory initialization timed out after MCP startup and the provider rejected the `batch_tools` schema.

## Changes

- `skyth/gateway/gateway.ts`
  - Added an explicit early Quasar daemon startup step before `loadConfig()`, workspace setup, and MCP registry initialization.
  - Gateway boot now logs `[quasar] daemon ready at ...` before workspace and MCP startup logs when the daemon is available.
  - Gateway boot now unlocks Quasar before config hydration using `SKYTH_QUASAR_PASSWORD_B64`, `SKYTH_QUASAR_PASSWORD`, or an interactive password prompt.
  - Moved `createDurableStores()` before `initializeRegistries()`.
  - This initializes/unlocks Quasar durability before MCP registry initialization launches MCP servers.
  - Fallback behavior is unchanged because `createDurableStores()` still catches Quasar initialization failures and returns non-Quasar stores when needed.

- `skyth/gateway/durable/quasar-adapters.ts`
  - `initializeQuasarDurability()` now works with an already-unlocked daemon when no password env var is set.

- `skyth/providers/ai_sdk_resolver.ts`
- `package.json`
- `bun.lock`
  - Added `@ai-sdk/google` and routed Google models through `createGoogleGenerativeAI`.
  - Google no longer requires an OpenAI-compatible `api_base` for normal Google API usage.

- `skyth/quasar/client.ts`
  - Increased default Quasar IPC timeout from 2 seconds to 30 seconds.
  - Added `SKYTH_QUASAR_TIMEOUT_MS` / `QUASAR_TIMEOUT_MS` override support.

- `skyth/gateway/lifecycle/agent-session-boot.ts`
  - Loads the models.dev catalog before constructing the AI SDK provider during normal gateway boot.
  - Logs configured provider, model, API base, and whether an API key is present.

- `skyth/providers/ai_sdk_provider.ts`
  - Logs provider reachability/request failures with action, provider, default model, resolved model, API base, key presence, gateway routing, and error message.
  - This is intended to explain why the runtime enters degraded mode after provider changes.

- `skyth/providers/ai_sdk_provider_tools.ts`
  - Normalizes JSON schemas before AI SDK tool creation.
  - Array properties without `items` now receive `{ type: "string" }`, addressing Google `GenerateContentRequest...items: missing field` errors.

- `skyth/base/base_agent/memory/providers/quasar.ts`
  - Default memory database path now uses `~/.skyth/quasar/memory.quasardb` instead of repo-relative `memory/main`.
  - This aligns the memory provider with gateway durability boot and avoids stale local Quasar database authentication failures.

- `skyth/gateway/meta/tools/batch_tools.ts`
  - Changed nested call item schema from `required: true` to `required: ["tool"]`.

- `skyth/base/base_agent/tools/gateway_adapter.ts`
- `skyth/base/base_agent/tools/gateway_runtime.ts`
- `skyth/gateway/meta/tools/manager/exposure.ts`
  - Added recursive conversion of nested `ToolParameter` objects to provider/MCP JSON Schema.
  - Internal `name` metadata is no longer emitted inside nested `properties` or `items`.
  - Nested array/object `required` arrays are preserved when present.

- `tests/batch_tools_schema.test.ts`
  - Adds a regression check for the provider-facing nested schema shape.

- `tests/quasar_durability_init.test.ts`
  - Adds regression coverage for already-unlocked Quasar durability initialization and env-password unlock.

- `tests/ai_sdk_provider_tools_schema.test.ts`
  - Covers recursive array `items` normalization.

- `tests/quasar_memory_provider.test.ts`
  - Updated coverage for the durable Quasar memory database path.

## Verification

- `bun run typecheck` passed.
- `bun test tests/batch_tools_schema.test.ts` passed.
- `bun test tests/quasar_durability_init.test.ts tests/batch_tools_schema.test.ts` passed.
- `bun test tests/ai_sdk_provider_tools_schema.test.ts tests/quasar_memory_provider.test.ts tests/quasar_durability_init.test.ts tests/batch_tools_schema.test.ts` passed.
- `./scripts/loc_check.sh` passed policy with 0 files >= 400 LOC.

## Known Follow-up

- `bun test tests/batch_tools_schema.test.ts tests/gateway_boot_wiring.test.ts` showed three existing `buildGatewayAgentSession` cases timing out while starting the real Quasar memory-provider path. The new schema test passed and the no-op durable-store case passed.
- The next useful test cleanup is to isolate or mock Quasar in `tests/gateway_boot_wiring.test.ts` so boot wiring tests do not depend on live IPC startup.
