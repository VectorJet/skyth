# Handoff - Claude Gateway Harness Review

Date: 2026-05-21

Reviewed:

- `.agents/suggestions/2026-04-13/skyth-next-suggestions.md`
- `specs/quasar/quasar-v1.md`
- `.agents/answers/2026-05-18/quasar-sidecar-answers.md`
- repo-local `quasar/`
- `~/dev/experiments/claude-gateway/`

## Findings

The `claude-gateway` experiment is best treated as the candidate Skyth gateway/harness baseline. It is intentionally separate from the Quasar v1 implementation, which lives in repo-local `quasar/`.

Strong `claude-gateway` areas:

- MCP gateway and ChatGPT-compatible SSE/message routes.
- Registry-based loading for tools, pipelines, skills, and MCP servers.
- Runtime source layout for builtin, workspace, and temporary capabilities.
- Hook pipeline for manifest existence, validation, AX metadata, source policy, permission scans, smoke tests, and audit reports.
- Channel subsystem with Telegram and web channels, persistent queueing, burst coalescing, channel behavior hints, and workspace binding.
- Memory/search prototype using Bun SQLite, FTS, optional sqlite-vec, archive import, and semantic fallback. This should become a Quasar-backed adapter rather than the durable authority.
- Hot reload and runner facades for tools, pipelines, skills, MCP, and agents.

Quasar status:

- `quasar/` implements the v1 shape directly: SQLCipher-backed quasardbs, Argon2id, header sidecars, device fingerprint checks, VFS, auth grants, sqlite-vec registration, Epsilon CAS/snapshots, Solar/Nebula/Galaxy branches, heartbeat/cron/export/state services, and local IPC protocol/Unix transport.
- `cargo test` passes in `quasar/`: 16 pass, 0 fail.
- The Windows named-pipe transport is still labeled as a skeleton.
- The binary currently wires a permissive `MockGateway`; production Skyth needs a real gateway adapter for IPC authentication, Quasar-priority scheduling, prompts, and audit forwarding.
- `quasar/src/vfs/ops.rs` is 353 LOC, close to the Skyth 400 LOC split threshold.

Integration direction:

- Use `claude-gateway` as the TypeScript gateway baseline.
- Use repo-local `quasar/` as the local state authority.
- Add a TypeScript Quasar IPC client in the gateway, then migrate durable queue, memory, heartbeat, cron, and state transitions behind that adapter.
- Keep `claude-gateway` memory/search as a compatibility layer until its data can be imported or mirrored into Quasar VFS/main.quasardb.

Skyth Next alignment gaps:

- Several files exceed the desired file-size cap, most notably `mcp-gateway/src/memory/store.ts` at 1932 LOC.
- Many TypeScript files use relative imports instead of the required `@/` imports.
- Manifest validation is partial and does not enforce the full Skyth contract fields: `id`, `name`, `version`, `entrypoint`, `capabilities`, `dependencies`, and `security`.
- The harness has gateway-centric behavior and no standalone core `AgentSession` loop yet.
- Delegation safety controls are represented only as runner/agent scaffolding, not bounded-depth/circular-call runtime enforcement.
- Heartbeat exists in both places; gateway heartbeat flow should route through Quasar's Generalist-only heartbeat service.

## Fix Applied

Found and fixed a production-relevant duplicate suppression issue:

- Before: `MessageRouter` de-duped only by `messageId`.
- Problem: channel-native message ids are not globally unique. Telegram `message_id` is scoped to a chat.
- After: de-dupe key is `channel:chatId:messageId`.

Files changed in the experiment:

- `mcp-gateway/src/channels/queue.ts`
- `mcp-gateway/tests/phase2.test.ts`

## Verification

From `~/dev/experiments/claude-gateway/mcp-gateway`:

- `bun test tests` passed: 33 pass, 0 fail.
- `bunx tsc --noEmit` passed.

## Recommended Next Steps

1. Decide whether `claude-gateway` should become a Skyth Next gateway surface or remain an external experiment.
2. If promoted, extract the registry/runtime/channel pieces first and leave Quasar as a separate local authority service.
3. Define a Quasar adapter boundary before wiring gateway memory/queues to it.
4. Split `src/memory/store.ts` before adding new memory behavior.
5. Normalize TypeScript imports to `@/` before moving code into Skyth.
