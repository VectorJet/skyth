# Handoff - Quasar v1 Harness-Agnostic Review

Date: 2026-05-18

## Summary

Quasar v1 was reviewed against `specs/quasar/quasar-v1.md`, VFS reference code under `refs/VFS/agent-vfs/`, and gateway/harness adapter patterns under `refs/harnesses/`.

Two concrete harness-agnostic gaps were fixed:

- IPC VFS calls could not work from an external gateway/harness because databases had to already be cached in-process and no request could open them.
- Full export only exported the `memory` namespace, making export behavior depend on one namespace convention.

## Changed Files

- `quasar/src/ipc/protocol.rs`
  - Added `DbOpen` request and `DbOpened` response.
- `quasar/src/ipc/server.rs`
  - Reduced to shared server state plus length-prefixed frame IO.
- `quasar/src/ipc/handlers.rs`
  - Moved request routing/core handler logic here.
- `quasar/src/ipc/service_handlers.rs`
  - Added heartbeat, cron, and export handler implementations.
  - IPC export now records the produced archive bytes as an Epsilon snapshot on the returned Galaxy branch.
- `quasar/src/ipc/handler_utils.rs`
  - Added shared handler response/base64 helpers.
- `quasar/src/ipc/handlers_tests.rs`
  - Added public IPC-path harness-neutral VFS roundtrip test.
- `quasar/src/vfs/ops.rs`
  - Added `list_all()`.
- `quasar/src/services/export.rs`
  - Full export now includes all namespaces and writes relative ZIP paths.
  - Added multi-namespace full export test.
- `specs/progress/Progress.md`
  - Overwritten with current progress and verification status.

`cargo fmt` also normalized formatting in several existing Rust files.

## Verification

- `cargo fmt`
- `cargo test` -> 16 passed
- `cargo check`
- `cargo build`
- LOC fallback scan because `./scripts/loc_check.sh` is absent:
  - all Rust source files are below 400 LOC
  - largest current files: `vfs/ops.rs` 353, `ipc/handlers.rs` 340, `db/open.rs` 309

## Remaining Work

- Windows named pipe transport remains a stub.
- Vector path needs a hardening pass before production use:
  - load/verify `sqlite-vec`
  - validate vector table identifiers
  - add vector operation tests
- Current DB open policy is Generalist-only, which matches the privileged gateway model but may need a narrower permission grant if non-Generalist administrative harnesses are introduced.
- Quasar is not a full replacement for the richer main-agent scheduler/runtime in legacy Skyth or OpenClaw:
  - legacy/OpenClaw heartbeat reads actionable `HEARTBEAT.md`, runs main-session turns, handles `HEARTBEAT_OK`, target visibility, active hours, skip-when-busy, isolated/light context, and notification policy.
  - legacy/OpenClaw cron validates `at`/`every`/cron schedules, computes next-run state, runs timers, records status/errors, supports main-session vs isolated/custom sessions, and handles delivery/failure routing.
  - legacy Skyth delegation tests enforce bounded depth and circular-call prevention beyond Quasar's current Generalist id boundary.
  - Quasar currently provides state authority and IPC primitives for these systems, not their full runtime behavior.
