# LOC Split Handoff

Date: 2026-05-21

Goal: split all code files reported by `./scripts/loc_check.sh` so no code file is >= 400 LOC.

Completed this pass:

- Split `skyth/gateway/meta/tools/execute_tool.ts` into focused helper modules under `skyth/gateway/meta/tools/execution/`.
- Split `skyth/gateway/meta/tools/find_tools.ts` into search/token helper modules.
- Split `skyth/gateway/meta/tools/manager.ts` into exposure, tabs, runtime reload, fingerprint, timer, and legacy pipeline helpers.
- Split `skyth/gateway/registries/tools/loader.ts` into scan/register helpers.
- Split `skyth/gateway/loaders/pipelines/pipeline-loader.ts` into a candidate-file helper.
- Split `skyth/gateway/mcp/protocol-handler.ts` into MCP tool-call formatting/dispatch helpers.
- Split `skyth/gateway/channels/web/web-channel.ts` into inbound message normalization helpers.
- Split `skyth/gateway/builtin/tools/apply_patch/patch.ts` into replacement/matching helpers.
- Split `skyth/gateway/api/routes/tool-routes.ts` into tool error-detail helpers.
- Verified with `bun run typecheck`.
- Verified current target list with `./scripts/loc_check.sh`.

Important implementation detail:

- `execute_tool.ts` re-exports several symbols from the new helper modules to preserve existing imports:
  - `ExecuteToolRunners`
  - `formatCompletedToolResult`
  - `clearOldToolRuns`
  - `getAllToolRuns`
  - `getToolRunStatus`
  - `markToolRunWaitRequested`
- The file is near the threshold, so avoid adding new behavior there. Put future execution lifecycle, formatting, or schema changes in `skyth/gateway/meta/tools/execution/`.

Remaining large files from the latest LOC check:

- None. `./scripts/loc_check.sh` reports `Files >= 400 LOC: 0`.

Suggested next step:

- Avoid adding new behavior directly to files in the close-to-threshold group. Use the helper modules created in this pass.
