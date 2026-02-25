# Progress

## Completed
- Added `skyth migrate` command with two-way compatibility for OpenClaw:
  - `skyth migrate from openclaw`
  - `skyth migrate to openclaw`
- Implemented whole-workspace migration behavior:
  - Recursive workspace copy between `~/.openclaw/workspace` and `~/.skyth/workspace`.
  - Agent data copy between OpenClaw agent folders and Skyth workspace agent folders.
- Implemented session migration:
  - OpenClaw event JSONL -> Skyth session JSONL (`_type: metadata` + messages).
  - Skyth session JSONL -> OpenClaw event JSONL (`type: session/message`).
- Implemented cron migration:
  - OpenClaw cron schema (`everyMs`, `nextRunAtMs`, `payload.text`) -> Skyth cron schema.
  - Skyth cron schema -> OpenClaw cron schema.
  - Cron run history directories are copied when present.
- Implemented memory/heartbeat migration:
  - `memory/heartbeat-state.json` copied both directions.
  - Daily markdown files are migrated for compatibility:
    - OpenClaw-style date files are copied into Skyth `memory/daily/`.
    - Skyth `memory/daily/*.md` files are copied into OpenClaw `memory/`.
- Implemented Telegram compatibility migration:
  - OpenClaw Telegram token/allowlist -> Skyth channel config + secret storage path.
  - Skyth Telegram token/allowlist -> OpenClaw `openclaw.json` + credentials allowlist file.
- Added CLI wiring and usage updates:
  - Registered `migrate` in `skyth/cli/main.ts`.
  - Exported command via `skyth/cli/commands.ts`.
  - Updated CLI usage text in `skyth/cli/runtime_helpers.ts`.

## Validation
- Ran:
  - `bun test tests/migrate_command.test.ts`
  - `bun test tests/migrate_command.test.ts tests/commands.test.ts tests/cron_commands.test.ts`
  - `bun run build:bin`
  - `./dist/skyth migrate help`
- Result:
  - Tests passed (`0 fail`).
  - CLI build succeeded.
  - Migration command help output verified.

## Notes
- Existing unrelated local changes were preserved and not reverted.
- Migration is scoped to OpenClaw interoperability and focuses on workspace, sessions, cron, heartbeat state, daily markdown memory, and Telegram auth/allowlist state.
