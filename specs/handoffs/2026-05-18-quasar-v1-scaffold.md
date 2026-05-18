# Handoff: Quasar v1 Scaffold

**Date:** 2026-05-18
**Spec:** `specs/quasar/quasar-v1.md`

## Status

- Rust crate at `quasar/` builds clean (`cargo build`, `cargo check`).
- 14/14 unit tests pass (`cargo test`).
- All source files under the 400 LOC ceiling (largest: `db/open.rs` at 305).
- No emoji anywhere.

## What's Live

Foundational layers are functional, not stubs:

- `db/open.rs` opens or initializes an encrypted SQLite + SQLCipher
  database with Argon2id key derivation, a random salt, and a sealed
  per-database password. Device fingerprint is bound at create time and
  checked on subsequent opens.
- `vfs/ops.rs` provides read/write/edit/delete/list against
  `vfs_entries`, appends rows to the shared `events` table, and writes
  `audit` rows on delete.
- `auth/permissions.rs` enforces the v1 policy (Generalist god-mode,
  open reads, explicit writes).
- `crypto/{kdf,seal}.rs` are working primitives (tested round-trip,
  wrong-key rejection).
- `epsilon/cdc.rs` does real FastCDC + BLAKE3 chunking.
- `epsilon/store.rs` is a working filesystem CAS at `~/.skyth/epsilon/`.
- `ipc/server.rs` + `ipc/unix.rs` accept connections, read/write
  length-prefixed JSON envelopes, and dispatch via `handle_request`.

## What's Skeleton (intentional, deferred by spec)

- `services/export.rs` returns `Error::NotImplemented` for archive emission
  because selector → bytes requires the detailed VFS schema flagged as
  open in `quasar-v1.md`.
- `ipc/server.rs` returns an error for VFS verbs until the gateway is
  wired (auth db handle + permission checks).
- `ipc/windows_pipe.rs` is `NotImplemented` (Unix is primary in v1 dev).
- `sqlite-vec` extension is not yet loaded. Vector storage path is not
  exercised; default `main.quasardb` is event store only today.
- Onboarding superuser-password flow is not yet wired (`auth/store.rs`
  exposes `open_or_init` + `set_username`; CLI/UI to invoke it is out of
  scope for this commit per spec note "See Legacy Skyth(ts) Implementation
  for Onboarding Reference").

## Next Suggested Steps

1. Wire `services/gateway.rs::Gateway` to a concrete implementation that
   owns an `AuthDb` and a router from `db_path` → opened `QuasarDb`
   handles, then enable VFS verbs in `ipc/server.rs`.
2. Load `sqlite-vec` extension on `main.quasardb` open and add a thin
   vector table to `db/schema.rs` (or a separate `vec_schema.rs`).
3. Pull the legacy Skyth(ts) onboarding flow as a reference and add an
   `onboarding` module that calls `AuthDb::open_or_init` on first run.
4. Implement archive emission in `services/export.rs` once the detailed
   VFS schema lands; create the Galaxy branch + audit row in the same
   transaction.
5. Add a heartbeat ticker driven by `services/state::StateDomain` so the
   Generalist receives periodic dispatches.
6. Windows: implement `ipc/windows_pipe.rs` with
   `tokio::net::windows::named_pipe::NamedPipeServer`.

## Open Deferred Areas (verbatim from spec)

- LGP and tool execution.
- `quasar-cli`.
- Recovery mode.
- Plugin architecture.
- Custom per-quasardb passwords.
- Cross-device migration and device rebind.
- Detailed SQLite schema.
- Detailed IPC message schema.
- Detailed Epsilon chunk format.
