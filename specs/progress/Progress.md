# Progress - 2026-05-18

## Quasar v1 Harness-Agnostic Review and Fixes

Reviewed the Rust Quasar v1 crate against `specs/quasar/quasar-v1.md`, VFS reference harnesses under `refs/VFS/agent-vfs/`, and harness patterns under `refs/harnesses/` where state access is mediated through explicit runtime/gateway adapters rather than hidden in-process state.

### Fixes Completed

- Added explicit IPC `db_open` operation:
  - `RequestKind::DbOpen { db_path, db_kind, create_if_missing }`
  - `ResponseKind::DbOpened { db_path, db_kind }`
  - Allows a gateway or harness to open/create any `*.quasardb` after onboard/unlock before issuing VFS calls.
- Cached the unlock password only in process memory so IPC can open encrypted quasardbs after authentication.
- Changed VFS IPC failure for unopened databases to an actionable error: send `db_open` first.
- Added public IPC-path coverage proving harness-neutral flow:
  - onboard
  - db_open
  - VFS write as Generalist
  - VFS read as another actor via open-read policy
- Fixed full export behavior:
  - `ExportSelector::Full` now enumerates all VFS namespaces instead of only `memory`.
  - ZIP paths now trim leading VFS `/` so archives contain relative entries like `memory/a.txt`.
  - IPC export now snapshots the produced archive bytes into Epsilon under the returned Galaxy branch.
  - Added export coverage for multiple namespaces.
- Split IPC implementation to satisfy the repo LOC policy:
  - `ipc/server.rs` now owns shared state and frame IO.
  - `ipc/handlers.rs` owns request routing and core handlers.
  - `ipc/service_handlers.rs` owns heartbeat/cron/export handlers.
  - `ipc/handler_utils.rs` owns handler utility conversions.
  - `ipc/handlers_tests.rs` owns IPC regression tests.

### Verification

- `cargo fmt`: clean
- `cargo test`: 16/16 passing
- `cargo check`: clean
- `cargo build`: clean
- LOC scan fallback was used because `./scripts/loc_check.sh` does not exist:
  - largest files: `vfs/ops.rs` 353 LOC, `ipc/handlers.rs` 340 LOC, `db/open.rs` 309 LOC
  - all Rust source files are below 400 LOC

### Spec Coverage Confirmed

- Local-only IPC with transport-agnostic JSON envelope remains intact.
- Gateway-mediated request path is now usable by external harnesses because DB lifecycle is explicit.
- Universal VFS remains namespace/path based and is not tied to one harness namespace convention.
- Full export now matches the spec requirement to export VFS contents across namespaces.
- Delete and restore prompts remain gateway mediated.
- Generalist-only heartbeats, cron registration, export, and DB open remain enforced.

### Agent/Cron/Heartbeat Harness Crosscheck

Compared against legacy Skyth and OpenClaw references for main-agent scheduling:

- `legacy(ts)/skyth/heartbeat/service.ts`
- `legacy(ts)/tests/heartbeat_service.test.ts`
- `legacy(ts)/skyth/cron/service.ts`
- `legacy(ts)/tests/cron_service.test.ts`
- `legacy(ts)/tests/gateway_delivery.test.ts`
- `legacy(ts)/tests/base_agent_delegation_call_stack.test.ts`
- `refs/harnesses/openclaw/docs/gateway/heartbeat.md`
- `refs/harnesses/openclaw/docs/automation/cron-jobs.md`

Findings:

- Quasar matches the low-level authority boundary: heartbeat/cron are system/gateway services, not user-facing delivery channels, and privileged registration is Generalist-only.
- Quasar does not yet implement the richer main-agent scheduler semantics from the references:
  - heartbeat ticks read actionable `HEARTBEAT.md` content and return/drop `HEARTBEAT_OK`
  - heartbeat target/visibility rules such as `none`, `last`, active hours, skip-when-busy, isolated/light context
  - cron schedule validation for `at`, `every`, and cron expressions with timezone checks
  - cron timers, due-job execution, next-run state, run status/error tracking, wake modes, and delivery/failure notification policy
  - explicit main-session vs isolated/custom-session execution styles
  - delegation call-stack enforcement beyond the Generalist id boundary

Conclusion: Quasar is harness-agnostic as a local state/IPC/VFS authority, but it is not a drop-in replacement for the full agent harness scheduler/runtime. Those higher-level heartbeat, cron, delivery, and delegation behaviors should remain in the gateway/agent harness or be implemented as a separate integration layer over Quasar.

### Remaining Deferred v1 Areas

These are still intentionally scaffolded or deferred and should not be treated as complete:

- Windows named pipe transport is still a stub.
- Detailed IPC verb set beyond current v1 coverage remains minimal.
- `sqlite-vec` extension loading/vector table hardening needs follow-up before vector search should be considered production-ready.
- Recovery mode and custom per-quasardb passwords remain out of v1 scope per spec.
