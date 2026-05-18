# Progress - 2026-05-18

## Quasar v1 Implementation Start

Scaffolded `quasar/` as a Rust crate (lib + binary) implementing the
foundational layers of the v1 spec at `specs/quasar/quasar-v1.md`.

### Module Map

```
quasar/src/
  lib.rs              public surface
  main.rs             binary entry; starts tracing + IPC server
  error.rs            Quasar error enum / Result alias
  paths.rs            ~/.skyth/ resolution (auth, main, agent private, IPC endpoint)
  fingerprint.rs      device fingerprint (BLAKE3 of mangled system facts)

  crypto/
    kdf.rs            Argon2id key derivation (KEY_LEN=32, SALT_LEN=16)
    seal.rs           AES-256-GCM seal/unseal for sealed db password

  db/
    schema.rs         base meta/events/audit tables, meta_keys constants
    open.rs           SQLCipher open/init; header sidecar; fingerprint check;
                      bootstrap chicken-and-egg solved via .header sidecar

  auth/
    permissions.rs    grants table + PermissionStore (Generalist god-mode,
                      open reads, explicit writes)
    store.rs          AuthDb wrapping auth.quasardb; identity table

  vfs/
    types.rs          Namespace, VfsPath (rejects ..), VfsEntry
    schema.rs         vfs_entries table
    ops.rs            read/write/edit/delete/list with events + audit

  branch/
    mod.rs            Solar / Nebula / Galaxy taxonomy + BranchRef

  epsilon/
    cdc.rs            FastCDC chunking + BLAKE3 hashing
    snapshot.rs       Mode (EventBased/TickBased), Retention, Snapshot
    store.rs          filesystem CAS at ~/.skyth/epsilon/{chunks,snapshots}
    restore.rs        prompt-gated restore

  ipc/
    protocol.rs       JSON envelope, RequestKind/ResponseKind (small v1 set)
    server.rs         transport-agnostic dispatch + length-prefixed framing
    unix.rs           Unix domain socket listener (tokio)
    windows_pipe.rs   named pipe stub (returns NotImplemented)

  services/
    gateway.rs        Gateway trait (auth, permission, prompt, audit)
    heartbeat.rs      HEARTBEAT.md append with YAML frontmatter
    cron.rs           CronJob + per-job permission profile
    export.rs         ExportSelector axes + Galaxy branch factory
    state.rs          StateDomain enum (10 domains Quasar owns)
```

### Verification

- `cargo check`: clean
- `cargo build`: clean
- `cargo test`: 14/14 passing
- All source files <= 305 LOC (under the 400 LOC ceiling)

### v1 Spec Coverage

Implemented:

- Encrypted `*.quasardb` open/init (SQLCipher AES-256, Argon2id KDF, random salt).
- Device fingerprint bind (raw system strings never stored).
- Sealed per-db password stored in header sidecar (recovery scaffolding).
- Universal VFS (namespaces, paths, R/W/E/D/list, events, audit).
- Permission model with Generalist god-mode + open reads.
- Solar/Nebula/Galaxy branch taxonomy.
- Epsilon CDC + content-addressed CAS + snapshot manifests.
- Time-based / tick-based / event-based snapshot mode + retention enums.
- Restore with mandatory pre-restore prompt.
- Local IPC over Unix domain sockets (Linux/macOS) with length-prefixed
  JSON envelope; Windows named pipe stub.
- Heartbeat `HEARTBEAT.md` append with YAML frontmatter.
- Cron job model with per-job permission profile (no blanket profile).
- State domain registry (gateway, desktop, android, web, cli, agent
  runtime, heartbeats, cron, memory, epsilon).
- Gateway trait pinned for runtime to implement.

Skeleton with explicit deferral (per spec's "Open Deferred Areas"):

- Export archive emission (depends on detailed VFS schema).
- IPC verb set beyond ping/status/vfs-rw (depends on detailed IPC schema).
- Windows named pipe transport.
- sqlite-vec extension load (vector ops not yet wired).
- Detailed Epsilon chunk format (current store is JSON manifests + raw chunks).

### Key Design Decisions

- Bootstrap chicken-and-egg (SQLCipher needs key, salt is in db): solved
  with a plaintext `.header` sidecar per quasardb holding salt, Argon2
  params, fingerprint hash, sealed password, schema version, db_kind.
- `apply_runtime_pragmas` is called only after `verify_key` succeeds so
  wrong-password attempts surface as `Error::AuthFailed`, not as opaque
  rusqlite IO errors from WAL setup against an unreadable file.
- Permission check policy lives in `auth/permissions.rs` and is the same
  policy whether invoked from the gateway, CLI, or in-process callers.
- Epsilon CAS fans out chunks by first 2 hex chars to keep directories
  manageable.
- No emoji in any source, log, or comment (AGENTS.md policy).
