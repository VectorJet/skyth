# Handoff - Skyth Gateway Neutralization

Date: 2026-05-21

## Work Completed

The first pass of replacing imported Claude Gateway core defaults with Skyth-owned naming is complete.

Key changes:

- Added `skyth/gateway/config/env.ts`.
- Skyth env vars now take precedence for gateway workspace, queue, memory, web relay, heartbeat, RAG, and filesystem root values.
- Legacy `CLAUDE_GATEWAY_*` env vars remain supported as fallbacks.
- Default persistent paths now use `~/.skyth/gateway/...`.
- Workspace bootstrap now creates Skyth-oriented files:
  - `AGENTS.md`
  - `SKYTH.md`
  - `IDENTITY.md` with `Name: Skyth`
  - heartbeat `## Agent ack`
- Compatibility remains for:
  - `CLAUDE.md`
  - heartbeat `## Claude ack`
  - `claude-response` web bridge messages
  - Claude export/import memory routes and IDs
- The router has a provider-neutral `AgentTurnInput` type. `ClaudeTurnInput` remains as a type alias for existing imports.

## Verification

Passed:

```bash
bun run typecheck
./scripts/loc_check.sh
```

Latest LOC check:

- Files >= 400 LOC: 0
- Files close to 400 LOC: 12

## Remaining Claude-Specific Compatibility Surfaces

Intentional compatibility/import surfaces:

- `/memory/import/claude-conversation`
- `/memory/import/claude-export`
- `claude:<uuid>` conversation IDs
- Claude export JSON type names and import helpers
- `MEMORY/raw/claude`
- `claude-response` web extension event

Remaining candidates for future neutralization:

- Env reads in memory embedding/search helpers and registry timers should move to `envFirst`/`envNumber`.
- User-facing meta-tool descriptions still mention Claude Gateway in several readmes/tools.
- Telegram compact/RAG commands still speak in Claude terms.
- `skyth/gateway/channels/manager.ts` has comment-only Claude references.
- Memory import APIs should eventually gain Skyth/provider-neutral route aliases while leaving Claude routes as explicit import compatibility.

## Caution

`skyth/gateway/channels/web/web-channel.ts` is now 391 LOC. Add future web channel behavior through helper modules instead of growing that file.
