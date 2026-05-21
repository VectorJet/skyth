# Handoff - Quasar Adapter Boundary

Date: 2026-05-21

## Summary

Started moving gateway-local durable stores behind Quasar adapter interfaces.
This is the first boundary patch, not the full store migration.

## Files Added

- `skyth/quasar/client.ts`
  - TypeScript IPC client for the Quasar length-prefixed JSON protocol.
  - Uses `SKYTH_QUASAR_SOCKET`, then `QUASAR_SOCKET`, then
    `~/.skyth/quasar.sock`.
  - Actor defaults to `generalist`.
- `skyth/gateway/durable/interfaces.ts`
  - Durable queue, memory, heartbeat, cron, and state transition contracts.
- `skyth/gateway/durable/quasar-adapters.ts`
  - Quasar heartbeat adapter.
  - Quasar cron adapter.
  - Quasar queue adapter.
  - Quasar state-transition VFS mirror.
  - Gateway memory compatibility adapter.
  - Quasar memory mirror adapter.
- `skyth/gateway/durable/index.ts`
  - Durable store factory used by gateway startup.

## Files Changed

- `skyth/gateway/channels/queue.ts`
  - Router now accepts `DurableQueueStore` and `DurableMemoryAuthority`.
  - Router no longer imports `getMemoryStore()` directly.
  - Router queue persistence calls now support sync or async stores.
- `skyth/gateway/channels/index.ts`
  - Startup now builds durable stores via `createDurableStores()`.
  - Queue and memory adapters are injected into `MessageRouter`.
  - Gateway startup/started transitions are recorded through the state adapter.
  - Gateway heartbeat startup event is routed through the heartbeat adapter.
- `skyth/gateway/workspace/queue-store.ts`
  - Existing SQLite queue now implements `DurableQueueStore`.
- `quasar/src/services/queue.rs`
  - Added Quasar-owned gateway queue table and claim/ack/release operations.
- `quasar/src/ipc/protocol.rs`
  - Added queue request and response variants.
- `quasar/src/ipc/handlers.rs`
  - Routed queue IPC variants.
- `quasar/src/ipc/service_handlers.rs`
  - Added queue handler implementations.
- `quasar/src/ipc/handlers_tests.rs`
  - Added claim/release/stats/ack coverage.

## Important Behavior

- `SKYTH_QUASAR_ADAPTERS=0` disables Quasar adapters and uses no-op
  heartbeat/cron/state adapters plus the gateway memory compatibility adapter.
- With default settings, Quasar heartbeat/cron/state/memory mirror calls are
  best-effort from gateway startup paths. Quasar failures are logged and do not
  block channel startup.
- Queue remains backed by the existing Bun SQLite store by default.
  Quasar queue IPC exists and `QuasarQueueAdapter` is available behind
  `SKYTH_QUASAR_QUEUE=1`.
- Quasar queue is not default yet because the gateway startup path does not
  currently perform the required Quasar unlock/open lifecycle before claiming
  rows.
- Memory RAG and thread search still read from the gateway compatibility store.
  Gateway turns are mirrored to Quasar VFS when IPC is available.

## Verification

- `bun run typecheck` passed.
- `cargo test` in `quasar/` passed: 17 passed, 0 failed.
- `./scripts/loc_check.sh` passed:
  - Files >= 400 LOC: 0
  - Files close to 400 LOC: 12
- `bun test tests/` did not run because `tests/` does not exist in this
  checkout.

## Recommended Next Steps

1. Wire gateway startup to Quasar unlock/open lifecycle so
   `SKYTH_QUASAR_QUEUE=1` can become the default safely.
2. Add memory/search Quasar APIs before moving `buildRagHint`, thread reads,
   thread search, and handoff writes off gateway SQLite.
3. Add state transition schema/service in Rust instead of VFS mirroring once
   the domain model is finalized.
