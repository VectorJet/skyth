# Progress

Updated: 2026-05-22T16:53:07Z

## Current Focus

Fixed the `./dist/skyth gateway` CLI lifecycle so the gateway no longer exits immediately after successful startup, then satisfied the mandatory LOC split policy.

## Completed (this slice)

- Identified the shutdown cause in the CLI command path:
  - `gatewayHandler` awaited `startGateway()`, returned `0`, and `skyth/cli/main.ts` then called `process.exit(code)`.
  - The direct gateway entrypoint stayed alive, but the built CLI wrapper exited because the command handler completed.
- Updated `skyth/cli/runtime/commands/gateway.ts` so the command remains pending after startup.
- Split over-limit code files reported by `./scripts/loc_check.sh`:
  - Extracted web channel constants/types/relay startup into focused modules under `skyth/gateway/channels/web/`.
  - Extracted Quasar base64 codec and IPC request framing into `skyth/quasar/codec.ts` and `skyth/quasar/ipc.ts`.
- Rebuilt the `dist/skyth` wrapper.

## Tests

- `bun run typecheck`
  - Passed.
- `bun run build:bin`
  - Passed.
- `./scripts/loc_check.sh`
  - Passed policy: 0 files >= 400 LOC.
  - Reports 16 files close to 400 LOC.
- `timeout 90s ./dist/skyth gateway`
  - Reached `>>> MCP Gateway running on http://localhost:52000`.
  - Stayed alive until `timeout` ended it with exit code 124.
  - Live configured channel/model traffic emitted provider errors after startup: DeepSeek rejected the current `batch_tools` schema and later hit rate limits. This is separate from the CLI lifecycle fix.

## Key Files Changed

- `skyth/cli/runtime/commands/gateway.ts`
- `skyth/gateway/channels/web/web-channel.ts`
- `skyth/gateway/channels/web/constants.ts`
- `skyth/gateway/channels/web/types.ts`
- `skyth/gateway/channels/web/relay-server.ts`
- `skyth/quasar/client.ts`
- `skyth/quasar/codec.ts`
- `skyth/quasar/ipc.ts`
- `specs/progress/Progress.md`
- `specs/handoffs/2026-05-22-gateway-cli-lifecycle.md`

## Next Steps

1. Consider adding a focused CLI lifecycle test that stubs `startGateway()` and verifies the gateway command does not resolve.
2. Fix the provider-facing JSON schema for `batch_tools`; live DeepSeek traffic rejects the current nested `required: true` shape.
3. Broaden graceful shutdown handling to include `SIGTERM` if gateway runs under supervisors or `timeout`.
