# Handoff - Gateway Source Import

Date: 2026-05-21

## Current State

The Claude Gateway MCP source has been imported into Skyth using the user's preferred source-only layout.

Source copied from:

```text
refs/harnesses/claude-gateway/mcp-gateway/src/
```

Destination:

```text
skyth/gateway/
```

This is not a standalone nested package. The imported files now live directly under Skyth's source tree, for example:

```text
skyth/gateway/gateway.ts
skyth/gateway/channels/
skyth/gateway/mcp/
skyth/gateway/registries/
skyth/gateway/meta/
skyth/gateway/memory/
```

## Changes Made

- Removed the earlier full-package import at `skyth/gateway`.
- Re-copied only the gateway `src/` contents into `skyth/gateway/`.
- Split the imported memory store into focused modules:

```text
skyth/gateway/memory/store.ts
skyth/gateway/memory/store/context.ts
skyth/gateway/memory/store/embeddings.ts
skyth/gateway/memory/store/gateway-turns.ts
skyth/gateway/memory/store/helpers.ts
skyth/gateway/memory/store/imports.ts
skyth/gateway/memory/store/persistence.ts
skyth/gateway/memory/store/rag.ts
skyth/gateway/memory/store/reindex.ts
skyth/gateway/memory/store/schema.ts
skyth/gateway/memory/store/search.ts
skyth/gateway/memory/store/thread.ts
skyth/gateway/memory/store/types.ts
```
- Rewrote local TypeScript imports to the repo-level absolute alias:

```text
@/gateway/...
```

- Added root dependencies needed by the imported gateway source:
  - `@modelcontextprotocol/sdk`
  - `hono`
  - `chalk`
  - `sqlite-vec`
- Updated root `tsconfig.json` with Bun ambient types:

```json
"types": ["bun"]
```

- Added root package integration:

```bash
bun run gateway
```

- Replaced root `index.ts` placeholder output with a `startGateway` export.

## Verification

Passed:

```bash
bun run typecheck
```

Ran but not clean:

```bash
bunx @biomejs/biome lint skyth/gateway
```

Biome reported inherited harness issues, mainly:

- `noExplicitAny`
- type-only import cleanup
- Node builtin imports should use `node:`
- one unused type import

Skipped:

```bash
./scripts/loc_check.sh
```

Reason: the script is absent and the repo instructions say to skip it while absent.

## Large Imported Files

The original `skyth/gateway/memory/store.ts` was split. The largest memory module is now 388 LOC.

These remaining imported files exceed or approach the Skyth size limit and should be split before new behavior is added:

```text
skyth/gateway/meta/tools/manager.ts                    876 LOC
skyth/gateway/meta/tools/execute_tool.ts               717 LOC
skyth/gateway/meta/tools/find_tools.ts                 634 LOC
skyth/gateway/channels/web/web-channel.ts              407 LOC
skyth/gateway/registries/tools/loader.ts               371 LOC
skyth/gateway/channels/telegram/telegram-channel.ts    371 LOC
skyth/gateway/mcp/protocol-handler.ts                  369 LOC
skyth/gateway/builtin/tools/apply_patch/patch.ts       368 LOC
```

## Recommended Next Steps

1. Split the remaining large gateway meta/channel modules before touching their behavior.
2. Add `skyth/core` runtime skeleton:
   - `AgentSession`
   - `AgentRunOrchestrator`
   - `StepRunner`
   - thread models/router/graph
3. Add `skyth/quasar/client.ts` as the TypeScript IPC boundary.
4. Begin replacing gateway-local durable stores with Quasar adapter interfaces.
5. Clean Biome lint in focused mechanical passes.
