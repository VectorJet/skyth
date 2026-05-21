# Progress

Updated: 2026-05-21T14:37:56Z

## Current Focus

Moved gateway durable concerns behind Quasar-oriented adapter interfaces and
started replacing compatibility stores with Quasar-owned services.

## Completed

- Added `skyth/quasar/client.ts` as the TypeScript Quasar IPC client.
  - Supports length-prefixed JSON frames over the Unix socket.
  - Exposes `ping`, `status`, `openDb`, VFS text read/write,
    `appendHeartbeat`, `registerCron`, and gateway queue verbs.
- Added durable gateway interfaces in `skyth/gateway/durable/interfaces.ts`.
  - Queue
  - Memory
  - Heartbeat
  - Cron
  - State transitions
- Added Quasar-oriented adapters in `skyth/gateway/durable/quasar-adapters.ts`.
  - Heartbeat routes to Quasar IPC.
  - Cron routes to Quasar IPC.
  - State transitions are mirrored as Quasar VFS records.
  - `QuasarQueueAdapter` routes queue push/claim/ack/release/stats through
    Quasar IPC.
  - Memory records still use the gateway compatibility store for behavior,
    then best-effort mirror gateway turns into Quasar VFS.
- Added `skyth/gateway/durable/index.ts` as the durable-store factory.
  - Queue remains compatibility-backed by default.
  - Set `SKYTH_QUASAR_QUEUE=1` to opt into `QuasarQueueAdapter`.
- Rewired `MessageRouter` to accept queue and memory authorities via adapter
  interfaces.
  - Queue store calls now support sync or async implementations.
- Rewired `startChannelSubsystem` to construct durable stores, inject queue
  and memory adapters, and record gateway state/heartbeat transitions through
  the adapter layer.
- Made `QueueStore` implement the durable queue interface so existing behavior
  remains available while Quasar queue startup is finalized.
- Added Quasar Rust queue service and IPC verbs:
  - `queue_push_user`
  - `queue_push_gateway`
  - `queue_claim_all`
  - `queue_mark_done`
  - `queue_release_inflight`
  - `queue_pending_stats`
- Added a Rust IPC queue test covering claim, release, stats, and ack.

## Verification

- `bun run typecheck` passed.
- `cargo test` in `quasar/` passed: 17 passed, 0 failed.
- `./scripts/loc_check.sh` passed.
  - Files >= 400 LOC: 0
  - Files close to 400 LOC: 12
- `bun test tests/` could not run because this checkout has no `tests/`
  directory.

## Notes

- The gateway no longer imports the concrete memory store in the router path.
- Quasar queue support is implemented but opt-in because Quasar queue
  operations require the target quasardb to be opened/unlocked before channel
  startup can claim rows. The next lifecycle step is to wire gateway startup
  into Quasar unlock/open or add a controlled service-owned open path.
- Quasar memory authority is currently a mirror for gateway turns, not the
  search authority. RAG still reads through the compatibility SQLite store
  until the Quasar memory schema/search surface lands.

## Next Steps

1. Wire gateway startup to Quasar unlock/open lifecycle so
   `SKYTH_QUASAR_QUEUE=1` can become the default without breaking startup.
2. Add a Quasar memory schema/search API, then move RAG and thread tools off
   the gateway SQLite compatibility store.
3. Add a state transition schema/service in Rust instead of VFS mirroring once
   the domain model is finalized.
4. Keep future edits out of near-threshold files listed by LOC check,
   especially `telegram-channel.ts`, `execute_tool.ts`, and `web-channel.ts`.
