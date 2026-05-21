# Progress

Updated: 2026-05-21T14:53:13Z

## Current Focus

Finished the remaining Quasar-focused gateway durability migration items so the
next agent can focus on non-Quasar runtime work.

## Completed

- Added `skyth/quasar/client.ts` as the TypeScript Quasar IPC client.
  - Supports length-prefixed JSON frames over the Unix socket.
  - Exposes onboarding, unlock, `openDb`, VFS text read/write, heartbeat,
    cron, queue, state, and memory IPC methods.
- Added durable gateway interfaces in `skyth/gateway/durable/interfaces.ts`.
  - Queue
  - Memory
  - Heartbeat
  - Cron
  - State transitions
- Added durable adapters in `skyth/gateway/durable/quasar-adapters.ts`.
  - Heartbeat routes to Quasar IPC.
  - Cron routes to Quasar IPC.
  - Queue routes to Quasar IPC when Quasar initialization succeeds.
  - State transitions now route to Quasar state IPC.
  - Memory gateway turns and RAG search now route to Quasar memory IPC, with
    compatibility fallback to the gateway SQLite memory store.
- Added `skyth/gateway/durable/index.ts` as the durable-store factory.
  - Quasar initialization uses `SKYTH_QUASAR_PASSWORD_B64` or
    `SKYTH_QUASAR_PASSWORD`.
  - If Quasar is unavailable, locked, or credentials are absent, the gateway
    falls back to compatibility stores/no-op adapters without blocking startup.
- Rewired `MessageRouter` to accept queue and memory authorities via adapter
  interfaces.
  - Queue store calls support sync or async implementations.
- Rewired `startChannelSubsystem` to construct durable stores asynchronously,
  inject queue and memory adapters, and record gateway state/heartbeat
  transitions through the adapter layer.
- Added Quasar Rust queue service and IPC verbs:
  - `queue_push_user`
  - `queue_push_gateway`
  - `queue_claim_all`
  - `queue_mark_done`
  - `queue_release_inflight`
  - `queue_pending_stats`
- Added Quasar Rust state-transition service and IPC verbs:
  - `state_record`
  - `state_latest`
- Added Quasar Rust memory service and IPC verbs:
  - `memory_record_gateway_turn`
  - `memory_search`
- Added Rust IPC tests for queue and state/memory round trips.

## Verification

- `bun run typecheck` passed.
- `cargo test` in `quasar/` passed: 18 passed, 0 failed.
- `./scripts/loc_check.sh` passed.
  - Files >= 400 LOC: 0
  - Files close to 400 LOC: 13
- `bun test tests/` could not run because this checkout has no `tests/`
  directory.

## Notes

- Quasar can now be the durable queue authority when the daemon is reachable
  and the gateway is given unlock credentials through environment variables.
- No plaintext credentials are written by this change.
- Quasar memory is currently a basic FTS-backed durable gateway-turn memory
  service. Legacy imported conversation/thread data still lives in the
  compatibility SQLite store until an import/migration path is added.
- Thread tools still call `getMemoryStore()` directly. Their gateway turns and
  RAG path now have Quasar service coverage, but imported Claude thread reads,
  thread search, and handoffs still need a provider-neutral thread layer.

## Next Steps

1. Move non-Quasar runtime work forward:
   - Add `AgentSession` / core run API.
   - Keep gateway routes as wrappers around `AgentSession.run`.
   - Prevent the gateway from becoming the agent loop.
2. Add the provider-neutral thread layer and migrate thread tools away from
   Claude/gateway compatibility naming.
3. Add explicit migration/import from gateway SQLite memory into Quasar memory
   if preserving existing imported conversation data is required.
4. Split near-threshold files before adding behavior:
   - `skyth/gateway/channels/telegram/telegram-channel.ts`
   - `skyth/gateway/meta/tools/execute_tool.ts`
   - `skyth/gateway/channels/web/web-channel.ts`
   - `skyth/gateway/channels/queue.ts`
