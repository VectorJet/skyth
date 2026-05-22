# Progress

Updated: 2026-05-22T03:46:04Z

## Current Focus

Tightened Quasar filesystem permissions for encrypted databases and headers.

## Completed

- Confirmed `~/.skyth/quasar/secrets.quasardb` is encrypted via the Quasar
  encrypted database path:
  - SQLCipher key is a 32-byte Argon2id-derived key.
  - Each quasardb has a per-database random 16-byte salt.
  - The sealed per-database password uses AES-256-GCM.
- Updated Quasar path handling:
  - `paths::ensure_dir()` now sets owner-only directory permissions on Unix.
  - Quasar-managed directories are tightened to `0700`.
- Updated Quasar database open/create handling:
  - Quasardb files are tightened to `0600`.
  - Header sidecars are tightened to `0600`.
  - WAL and SHM files are tightened to `0600` when present.
- Applied permissions to the existing local files:
  - `~/.skyth`
  - `~/.skyth/quasar`
  - `~/.skyth/quasar/secrets.quasardb`
  - `~/.skyth/quasar/secrets.quasardb.header`
  - `~/.skyth/quasar/secrets.quasardb-wal`
  - `~/.skyth/quasar/secrets.quasardb-shm`

## Verification

- `cargo fmt` passed.
- `cargo test` in `quasar/` passed: 18 passed, 0 failed.
- `bun run typecheck` passed.
- `./scripts/loc_check.sh` passed.
  - Files >= 400 LOC: 0
  - Files close to 400 LOC: 17

## Notes

- Existing unrelated worktree state: `RESUME.md` is deleted. This was not part
  of this task and was not staged.
- Permission tightening is currently Unix-specific. Non-Unix platforms leave the
  path untouched until a Windows ACL implementation is added.

## Next Steps

1. Continue with the agent loop port once the user confirms.
2. Add Windows ACL tightening when named pipe/Windows support becomes active.
