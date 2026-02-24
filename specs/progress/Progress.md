# Progress

## Completed
- Reworked gateway/channel runtime logs into structured event lines without chat/user identifiers.
- Added shared event formatter in `skyth/logging/events.ts` with 15-character max summaries.
- Gateway runtime now emits event-style lifecycle and routing logs:
  - startup/shutdown
  - channel list/model/workspace summaries
  - inbound receive/block/send queue events
  - cron run/deliver/done events
- Channel manager now logs start/stop/send/error/drop as event records without IDs.
- Telegram channel now emits event records only (receive/send/drop/block/status/error) and removed chat/sender IDs from logs.
- Heartbeat service now emits heartbeat event records (`alive`, `idle`, `run`, `done`) for liveness visibility.
- Agent loop now emits event records for model calls, tool calls, assistant send, and bootstrap completion cleanup.
- Updated gateway logger parser/formatter to prioritize `[event|heartbeat|cron][scope] ...` entries and normalize fallback output.

## Validation
- Ran:
  - `bun test tests/agent_migration.test.ts tests/telegram_channel_ingress.test.ts tests/telegram_pairing.test.ts tests/channel_policy.test.ts tests/heartbeat_service.test.ts`
- Result: 22 passed, 0 failed.

## Notes
- Existing unrelated workspace changes were preserved.
- Event summaries are intentionally short and capped to 15 chars.
