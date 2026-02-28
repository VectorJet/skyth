# Progress

## In Progress

### Frontend Version Bump (2026-02-28)

Changed version from Open WebUI's 0.8.5 to 0.0.1.

## Files Modified

- `platforms/web/package.json` - version: "0.8.5" -> "0.0.1"

---

## Date
2026-02-28

## Work Completed
- Reverted Chat SDK channel migration commit (`62ffd0c`) from `main` while preserving auth/runtime security work.
- Restored legacy channel runtime wiring in `ChannelManager` (Telegram/Discord/Slack/WhatsApp legacy adapters).
- Removed Chat SDK-specific gateway constructor wiring and Chat SDK-only schema fields introduced by that migration.
- Preserved trusted-node auth runtime enforcement and gateway trust diagnostics from auth work.

## Files Changed (Revert)
- `skyth/channels/manager.ts`
- `skyth/channels/policy.ts`
- `skyth/cli/runtime/gateway.ts`
- `skyth/config/schema.ts`
- `skyth/cli/cmd/configure/pointers/channel.ts`
- `package.json`
- `bun.lock`

## Validation
- Pending after revert commit finalization.

## Notes
- Goal: keep auth features, remove unstable Chat SDK runtime path.
