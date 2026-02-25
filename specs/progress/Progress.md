# Progress

## Completed

### Superuser Auth Gate for Channel Operations
- Added `skyth/cli/cmd/channels/auth_gate.ts` with `isChannelPreviouslyConfigured()` and `requireSuperuserForConfiguredChannel()` utilities
- Both `skyth pairing` and `skyth configure channels` now require superuser password when modifying a previously configured channel (if a superuser password has been set)

### Pairing Reauthentication
- `skyth pairing telegram` now checks superuser auth before proceeding if the telegram channel is already configured
- Added `--reauth` flag to pairing command
- Added `promptPasswordFn` to `PairingTelegramDeps` for testable password prompts
- Updated help text with new options

### Configure Channels Command
- Added `channels`/`channel` topic to `skyth configure` command
- `skyth configure channels telegram` opens interactive channel configuration (clack TUI in TTY, plain prompts otherwise)
- `skyth configure channels telegram --json '{"token":"bot123"}' --enable` for non-interactive use
- `skyth configure channels telegram --set token=bot123` also supported
- All channel fields are prompted interactively with secrets masked
- Superuser password required if the channel was previously configured

### Files Modified
- `skyth/cli/cmd/channels/auth_gate.ts` (new)
- `skyth/cli/cmd/channels/index.ts` (exports)
- `skyth/cli/cmd/pairing/index.ts` (superuser gate + reauth arg)
- `skyth/cli/cmd/configure/index.ts` (channels topic)
- `skyth/cli/main.ts` (wire up new args)
- `skyth/cli/runtime_helpers.ts` (usage text)

### Tests
- All 84 tests pass (0 failures)
