# Progress

Updated: 2026-05-22T17:39:39Z

## Current Focus

Adjusted gateway boot so the Quasar daemon starts and unlocks before config loading, workspace setup, and MCP registry/server startup. Also fixed Google provider resolution/base URL handling, normalized provider tool schemas for Google, moved Quasar memory to the durable Quasar memory database, increased the default Quasar IPC timeout, fixed the provider-facing `batch_tools` nested JSON schema rejected by DeepSeek, and added provider reachability diagnostics for degraded-mode failures.

## Completed (this slice)

- Added an explicit early Quasar daemon startup step in `skyth/gateway/gateway.ts`.
  - It runs immediately after gateway log capture is installed and before `loadConfig()`.
  - It logs `[quasar] daemon ready at ...` before workspace and MCP startup logs.
  - It unlocks Quasar from `SKYTH_QUASAR_PASSWORD_B64` / `SKYTH_QUASAR_PASSWORD` when present, or prompts interactively before config hydration.
- Moved `createDurableStores()` ahead of `initializeRegistries()` in `skyth/gateway/gateway.ts`.
  - This causes Quasar unlock/open work to happen before MCP manifests are scanned and MCP servers are launched.
  - If Quasar adapters are disabled or unavailable, existing fallback durable stores still apply.
- Updated `initializeQuasarDurability()` so an already-unlocked daemon can open durable databases without requiring a password env var.
- Increased the default `QuasarClient` IPC timeout from 2 seconds to 30 seconds.
  - `SKYTH_QUASAR_TIMEOUT_MS` / `QUASAR_TIMEOUT_MS` can override the default.
- Added `@ai-sdk/google` and wired Google models through the Google AI SDK factory.
  - Google no longer requires an OpenAI-compatible base URL for normal Google API usage.
- Normalized provider-facing JSON schemas before AI SDK tool creation.
  - Any array property without an `items` schema now receives `{ type: "string" }`.
  - This addresses Google `GenerateContentRequest...items: missing field` errors for gateway tools.
- Changed the default `QuasarMemoryProvider` database path from repo-relative `memory/main` to `~/.skyth/quasar/memory.quasardb`.
  - This aligns the memory provider with the durable Quasar memory database opened during gateway boot and avoids authentication failures against stale local memory databases.
- Added provider boot/request diagnostics:
  - Gateway agent boot now loads the models.dev catalog before constructing the AI SDK provider and logs provider/model/API-base/key-presence configuration.
  - AI SDK provider failures now log action (`resolve-sdk`, `generate`, or `stream`), provider, default model, resolved model, API base, key presence, gateway routing, and error message.
- Fixed `batch_tools` nested call schema:
  - `calls.items.required` is now `["tool"]` instead of `true`.
  - Provider/MCP schema conversion now recursively strips internal `ToolParameter.name` fields from nested `properties` and `items`.
- Added a focused regression test for the emitted `batch_tools` schema.

## Tests

- `bun run typecheck`
  - Passed.
- `bun test tests/batch_tools_schema.test.ts`
  - Passed.
- `bun test tests/quasar_durability_init.test.ts tests/batch_tools_schema.test.ts`
  - Passed.
- `bun test tests/ai_sdk_provider_tools_schema.test.ts tests/quasar_memory_provider.test.ts tests/quasar_durability_init.test.ts tests/batch_tools_schema.test.ts`
  - Passed.
- `./scripts/loc_check.sh`
  - Passed policy: 0 files >= 400 LOC.
  - Reports 17 files close to 400 LOC.
- `bun test tests/batch_tools_schema.test.ts tests/gateway_boot_wiring.test.ts`
  - `tests/batch_tools_schema.test.ts` passed.
  - Three existing `buildGatewayAgentSession` cases in `tests/gateway_boot_wiring.test.ts` timed out while starting the real Quasar memory-provider path; the no-op durable-store case passed.

## Key Files Changed

- `skyth/gateway/gateway.ts`
- `skyth/gateway/durable/quasar-adapters.ts`
- `skyth/gateway/lifecycle/agent-session-boot.ts`
- `skyth/quasar/client.ts`
- `skyth/providers/ai_sdk_resolver.ts`
- `skyth/providers/ai_sdk_provider.ts`
- `skyth/providers/ai_sdk_provider_tools.ts`
- `skyth/base/base_agent/memory/providers/quasar.ts`
- `package.json`
- `bun.lock`
- `skyth/gateway/meta/tools/batch_tools.ts`
- `skyth/gateway/meta/tools/manager/exposure.ts`
- `skyth/base/base_agent/tools/gateway_adapter.ts`
- `skyth/base/base_agent/tools/gateway_runtime.ts`
- `tests/batch_tools_schema.test.ts`
- `tests/quasar_durability_init.test.ts`
- `tests/ai_sdk_provider_tools_schema.test.ts`
- `tests/quasar_memory_provider.test.ts`
- `specs/progress/Progress.md`
- `specs/handoffs/2026-05-22-quasar-before-mcp-and-batch-schema.md`

## Next Steps

1. Add Quasar-safe isolation/mocking for the `buildGatewayAgentSession` tests so they do not start the real IPC path.
2. Run a live `./dist/skyth gateway` smoke with a non-rate-limited provider to confirm Quasar initializes before MCP server logs and DeepSeek no longer rejects `batch_tools`.
