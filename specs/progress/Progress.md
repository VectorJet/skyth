# Progress

Updated: 2026-05-22T18:00:00Z

## Current Focus

Follow-ups requested in the last pairing pass are complete:

1. Dedicated Quasar IPC operation for run/session events (no more VFS JSON
   fallback for the hybrid run event sink).
2. Full gateway startup integration tests around provider config loading and
   the agent-session boot wiring.
3. A manual runbook script to exercise the live gateway path with Quasar
   enabled and a real provider.

## Completed (this slice)

- Rust quasar service `RunEventStore` (`quasar/src/services/run_events.rs`)
  with a `run_events` SQLite table indexed on `(run_id, sequence)` and
  `(run_id, ts_unix_ms)`.
- IPC additions: `RunEventRecord`, `RunEventList`, `RunEventId`,
  `RunEventRows` request/response variants and routing in
  `quasar/src/ipc/handlers.rs` and `quasar/src/ipc/service_handlers.rs`.
- Rust test `ipc_run_event_record_and_list_roundtrip` covering both
  operations end-to-end.
- TS protocol additions in `skyth/quasar/protocol.ts`.
- `QuasarClient.runEventRecord()` and `QuasarClient.runEventList()` in
  `skyth/quasar/client.ts`.
- `QuasarRunEventAdapter` rewritten to call the dedicated IPC op against a
  new `run_events.quasardb`; the `bestEffortQuasarWrite` VFS helper is
  deleted.
- `initializeQuasarDurability` opens the new `run_events.quasardb`.
- Gateway boot wiring extracted into
  `skyth/gateway/lifecycle/agent-session-boot.ts`:
  - `buildProviderConfig(env)` maps env vars to `AISDKProviderParams`.
  - `buildGatewayAgentSession(input)` constructs the provider, plugin
    manager, memory manager, subagent bus, and `SkythAgentSession`.
- `skyth/gateway/gateway.ts` delegates to `buildGatewayAgentSession` and no
  longer inlines the construction.
- Runbook `scripts/live_gateway_smoke.sh` for manual live-gateway smoke
  verification with Quasar enabled and a real provider.

## Tests Added

- `tests/gateway_boot_wiring.test.ts`
  - `buildProviderConfig` precedence and empty-env behavior.
  - `buildGatewayAgentSession` wires injected provider, run event sink, and
    delegation services; honors env-driven provider config; default memory
    manager registers QuasarMemoryProvider tools.
  - `createDurableStores` returns no-op adapters when
    `SKYTH_QUASAR_ADAPTERS=0`.
- `tests/quasar_run_event_adapter.test.ts`
  - Proves `QuasarRunEventAdapter` uses `runEventRecord` (never the VFS
    write path), increments sequence, preserves `stepIndex`, and falls back
    to `runId="unknown"` for non-run events.

## Verification

- `cargo test --lib` in `quasar/` passes: 19 passed, 0 failed.
- `bun run typecheck` passes.
- `bun test tests/` passes: 132 tests, 0 failures (up from 122).
- `bunx @biomejs/biome format --write` and `lint` on all changed TS files
  succeed with no diagnostics.
- `bash -n scripts/live_gateway_smoke.sh` succeeds.
- Required `./scripts/loc_check.sh` is still absent per repository
  instructions and intentionally skipped.

## Notes

- `QuasarRunEventAdapter` now lives at the IPC layer, not the VFS layer.
  Existing Quasar deployments need no migration because the table is
  created lazily by `RunEventStore::new`. A new `run_events.quasardb` file
  is created under `$SKYTH_HOME/quasar/` on first boot.
- The boot extraction is fully backward-compatible: omitting
  `provider`/`memoryManager`/`pluginManager` reproduces the original
  gateway behavior.
- The live smoke script is intentionally not part of CI; it documents the
  manual steps for confirming end-to-end channel behavior outside unit
  tests.
