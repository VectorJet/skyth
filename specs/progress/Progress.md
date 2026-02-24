# Progress

## Completed
- Added Telegram ingress filtering to prevent pairing/auth codes from entering agent history.
- Updated `skyth/channels/telegram.ts` to drop pairing payloads before builtin command handling and inbound publish:
  - direct pairing code messages (`ABC-123`, `ABC123`)
  - `/start <pairing-code>` messages
- Added coverage in `tests/telegram_channel_ingress.test.ts`:
  - drops raw pairing code payloads
  - drops `/start` pairing payloads
  - still forwards normal user messages

## Validation
- Ran:
  - `bun test tests/telegram_channel_ingress.test.ts tests/telegram_pairing.test.ts tests/channel_policy.test.ts`
  - `bun test tests/agent_migration.test.ts tests/channel_policy.test.ts tests/commands.test.ts tests/heartbeat_service.test.ts tests/telegram_pairing.test.ts tests/telegram_channel_ingress.test.ts`
- Result: all tests passed.

## Notes
- This change blocks pairing-code leakage into chat memory while preserving normal Telegram message flow.
