# Progress

Updated: 2026-05-21T14:16:19Z

Current focus: replacing imported Claude Gateway defaults with Skyth-owned gateway names while preserving compatibility aliases.

Completed:

- Added `skyth/gateway/config/env.ts` for Skyth-first env lookup with `CLAUDE_GATEWAY_*` fallback compatibility.
- Moved primary gateway workspace, queue, and memory defaults from `~/.claude-gateway/...` to `~/.skyth/gateway/...`.
- Updated workspace bootstrap files to create Skyth-oriented `AGENTS.md`, `SKYTH.md`, heartbeat `## Agent ack`, and Skyth identity defaults.
- Kept `CLAUDE.md`, `## Claude ack`, `claude-response`, and `CLAUDE_GATEWAY_*` compatibility paths where existing integrations still depend on them.
- Updated the filesystem MCP manifest to use `${SKYTH_GATEWAY_FILESYSTEM_ROOT}` and set both Skyth and legacy env vars during startup.
- Renamed the router turn type to `AgentTurnInput`, keeping `ClaudeTurnInput` as a compatibility type alias.
- Made the web channel prefer `skyth-response` while accepting legacy `claude-response`.

Verification:

- `bun run typecheck` passed.
- `./scripts/loc_check.sh` passed the large-file requirement:
  - Files >= 400 LOC: 0.
  - Files close to 400 LOC: 12.

Notes:

- `skyth/gateway/channels/web/web-channel.ts` is close to the LOC threshold after this change and should receive future behavior through helper modules.
- Claude import APIs and Claude conversation memory types remain intentionally present as compatibility/import surfaces, not core runtime naming.
