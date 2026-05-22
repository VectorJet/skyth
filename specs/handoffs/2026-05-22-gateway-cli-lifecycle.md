# Handoff: Gateway CLI Lifecycle

Date: 2026-05-22

## Summary

`./dist/skyth gateway` was closing immediately after printing the ready banner because the CLI command handler returned `0` after `startGateway()`. The top-level CLI then called `process.exit(code)`.

The fix keeps the gateway command pending after successful startup:

- `skyth/cli/runtime/commands/gateway.ts`
  - Changed `return 0` to an unresolved `Promise<number>`.

The existing `SIGINT` shutdown handler in `skyth/gateway/lifecycle/shutdown.ts` still owns interactive Ctrl+C shutdown.

This slice also handled the mandatory LOC check result by splitting both over-limit files:

- `skyth/gateway/channels/web/web-channel.ts`
  - Extracted constants to `constants.ts`.
  - Extracted pending/result types to `types.ts`.
  - Extracted relay-server startup to `relay-server.ts`.
- `skyth/quasar/client.ts`
  - Extracted base64 helpers to `codec.ts`.
  - Extracted IPC framing/request logic to `ipc.ts`.

## Verification

- `bun run typecheck` passed.
- `bun run build:bin` passed.
- `./scripts/loc_check.sh` passed policy with 0 files >= 400 LOC.
- `timeout 90s ./dist/skyth gateway` reached:
  - `>>> MCP Gateway running on http://localhost:52000`
  - Then remained alive until `timeout` exited with code 124.

## Notes

- `.gateway-reload-cache/` was already untracked and was not modified intentionally.
- The 90s smoke emitted live provider errors after startup:
  - DeepSeek rejected the current `batch_tools` schema.
  - Later requests hit provider rate limits.
  - These happened after the gateway reached the ready banner and remained alive, so they are separate follow-up issues.
