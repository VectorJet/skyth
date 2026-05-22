# Handoff - Quasar File Permissions

Date: 2026-05-22

## Summary

Quasar encrypted database files now get restrictive Unix permissions in code,
and the existing local `secrets.quasardb` files were tightened.

## Files Changed

- `quasar/src/paths.rs`
  - `ensure_dir()` now applies `0700` on Unix.
- `quasar/src/db/open.rs`
  - Open/create paths now apply `0600` to quasardb files, header sidecars, and
    WAL/SHM files when present.
  - Header writes also apply `0600` immediately.

## Local Permission State Applied

These paths were tightened in the current environment:

- `~/.skyth` -> `0700`
- `~/.skyth/quasar` -> `0700`
- `~/.skyth/quasar/secrets.quasardb` -> `0600`
- `~/.skyth/quasar/secrets.quasardb.header` -> `0600`
- `~/.skyth/quasar/secrets.quasardb-wal` -> `0600`
- `~/.skyth/quasar/secrets.quasardb-shm` -> `0600`

## Verification

- `cargo fmt`
- `cargo test` in `quasar/`: 18 passed
- `bun run typecheck`
- `./scripts/loc_check.sh`: 0 files >= 400 LOC

## Caveats

- This pass is Unix-only. Windows ACL tightening remains future work.
- `RESUME.md` is deleted in the worktree from unrelated prior state and was not
  staged for this change.
