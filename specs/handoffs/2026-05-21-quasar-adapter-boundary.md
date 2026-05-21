# Handoff - Quasar Adapter Boundary

Date: 2026-05-21

## Summary

Moved gateway-local durable stores behind Quasar adapter interfaces and added
Quasar-owned queue, state-transition, and basic memory services.

## Files Added

- `skyth/quasar/client.ts`
  - TypeScript IPC client for the Quasar length-prefixed JSON protocol.
  - Uses `SKYTH_QUASAR_SOCKET`, then `QUASAR_SOCKET`, then
    `~/.skyth/quasar.sock`.
  - Actor defaults to `generalist`.
  - Supports onboarding/unlock, VFS, heartbeat, cron, queue, state, and memory
    verbs.
- `skyth/gateway/durable/interfaces.ts`
  - Durable queue, memory, heartbeat, cron, and state transition contracts.
- `skyth/gateway/durable/quasar-adapters.ts`
  - Quasar heartbeat adapter.
  - Quasar cron adapter.
  - Quasar queue adapter.
  - Quasar state-transition adapter.
  - Gateway memory compatibility adapter.
  - Quasar memory adapter with compatibility fallback.
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
- `quasar/src/services/state_store.rs`
  - Added Quasar-owned state-transition table and latest-domain lookup.
- `quasar/src/services/memory.rs`
  - Added Quasar-owned gateway-turn memory table and FTS search.
- `quasar/src/ipc/protocol.rs`
  - Added queue, state, and memory request/response variants.
- `quasar/src/ipc/handlers.rs`
  - Routed queue, state, and memory IPC variants.
- `quasar/src/ipc/service_handlers.rs`
  - Added queue, state, and memory handler implementations.
- `quasar/src/ipc/handlers_tests.rs`
  - Added claim/release/stats/ack and state/memory coverage.

## Important Behavior

- `SKYTH_QUASAR_ADAPTERS=0` disables Quasar adapters and uses no-op
  heartbeat/cron/state adapters plus the gateway memory compatibility adapter.
- With default settings, Quasar heartbeat/cron/state/memory mirror calls are
  best-effort from gateway startup paths. Quasar failures are logged and do not
  block channel startup.
- Quasar durable adapters initialize when `SKYTH_QUASAR_PASSWORD_B64` or
  `SKYTH_QUASAR_PASSWORD` is provided and the daemon is reachable.
- If Quasar initialization fails, the gateway falls back to the existing queue
  store, compatibility memory, and no-op heartbeat/cron/state adapters.
- No plaintext credentials are written by this change.
- Memory RAG and thread search still read from the gateway compatibility store.
  Gateway turns and RAG search have Quasar service coverage, but imported
  conversation/thread data still needs a provider-neutral thread layer or a
  migration into Quasar memory.

## Verification

- `bun run typecheck` passed.
- `cargo test` in `quasar/` passed: 18 passed, 0 failed.
- `./scripts/loc_check.sh` passed:
  - Files >= 400 LOC: 0
  - Files close to 400 LOC: 12
- `bun test tests/` did not run because `tests/` does not exist in this
  checkout.

## Recommended Next Steps

1. Move non-Quasar runtime work forward: `AgentSession`, core run API, and
   gateway routes as wrappers.
2. Add provider-neutral thread APIs and migrate thread tools away from
   Claude/gateway compatibility naming.
3. Add an explicit import/migration path from gateway SQLite memory into
   Quasar memory if preserving imported conversations is required.
