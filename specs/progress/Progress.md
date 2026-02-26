# Progress

## Completed

### Cron and Heartbeat Delivery Routed to Last Active Channel (2026-02-26)

Implemented runtime delivery routing so automation responses are sent to a real channel target instead of remaining internal-only logs.

1. Gateway delivery target resolution
- Added `skyth/cli/gateway_delivery.ts`.
- Introduced:
  - `isChannelDeliveryTarget(channel)` to exclude non-channel targets (`cli`, `cron`, `heartbeat`).
  - `loadLastActiveChannelTarget(workspacePath)` to recover latest usable channel/chat from session metadata at startup.
  - `resolveDeliveryTarget({ channel, chatId, fallback })` to resolve explicit targets with fallback behavior.

2. Gateway runtime wiring for cron and heartbeat
- Updated `skyth/cli/main.ts`:
  - Tracks `lastActiveTarget` from inbound allowed channel traffic.
  - Bootstraps fallback target from persisted session metadata.
  - Heartbeat runs now execute against resolved target when available and publish outbound messages to that target.
  - Cron jobs now resolve target from payload or fallback last active target.
  - `system_event` cron jobs now auto-deliver when response exists and target is resolvable.
  - Added explicit event logs for resolved startup target and missing target drops.

3. Immediate cron store update for active jobs
- Updated local `~/.skyth/cron/jobs.json` to mark current `system_event` jobs with:
  - `deliver: true`
  - `channel: "telegram"`
  - `to: "7405495226"`
- This ensures existing jobs are not silent after gateway restart.

4. Test coverage
- Added `tests/gateway_delivery.test.ts` covering:
  - non-channel filtering
  - persisted target selection
  - explicit vs fallback resolution
  - partial target completion with fallback

## Files Modified

- `skyth/cli/main.ts`
  - Added last-active-target routing for heartbeat and cron delivery paths.
  - Added startup target visibility logging and no-target drop logging.

- `skyth/cli/gateway_delivery.ts` (new)
  - Added delivery target resolution and persisted target recovery helpers.

- `tests/gateway_delivery.test.ts` (new)
  - Added unit tests for helper behavior.

## Validation

Passed:
- `bun test tests/gateway_delivery.test.ts tests/cron_commands.test.ts tests/heartbeat_service.test.ts`
- `bun test tests/commands.test.ts`
- `bun run skyth/cli/main.ts gateway --help`

Notes:
- Full project `tsc --noEmit` was not used as a gating signal due existing repository-wide TypeScript baseline issues and OOM during full compilation in this environment.
