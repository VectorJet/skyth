# Handoff - Skyth Next Runtime and Capability Spec

Date: 2026-05-21

## Current State

The architectural direction is now captured in:

- `specs/skyth-next-runtime-and-capabilities.md`
- `specs/handoffs/2026-05-19-core-agent-loop-harness-review.md`
- `specs/handoffs/2026-05-21-claude-gateway-harness-review.md`
- `specs/quasar/quasar-v1.md`

The user wants the next agent to begin implementation immediately by copying the MCP gateway code into the Skyth folder and taking UX inspiration from legacy Skyth TypeScript plus all discussed refs.

Important terminology update: Skyth user-facing sessions are called **threads**. Keep `session` as a compatibility/transport term, but new durable runtime models should use `thread`.

## Implementation Starting Point

Use:

- Source gateway baseline: `refs/harnesses/claude-gateway/mcp-gateway`
- Destination recommendation: `skyth/gateway`
- State authority: repo-local `quasar/`
- UX/behavior reference: `legacy(ts)/skyth/base/base_agent`

The gateway clone was produced from `VectorJet/claude-gateway` at commit `c74345d`.

## First Implementation Slice

Start with a mechanical import, then normalize.

Recommended steps:

1. Copy `refs/harnesses/claude-gateway/mcp-gateway` into `skyth/gateway`.
2. Keep the imported code compiling as its own package first.
3. Rename Claude-facing internal concepts only where needed for Skyth neutrality; keep compatibility aliases for route/env compatibility.
4. Convert imports to Skyth-required `@/` absolute imports.
5. Split obvious large files before adding new behavior.
6. Add Skyth manifest and `.ax` schema validation around the imported capability registry.
7. Add a Quasar IPC client boundary, but do not migrate all stores in the same first patch.
8. Route gateway execution toward a new `AgentSession` API instead of embedding the agent brain in gateway routes.
9. Promote gateway `thread:*` tools and `/session`-style channel switching into the Skyth thread system.

## Core Runtime Target

Build the core as two layers:

- `AgentRunOrchestrator`
- `StepRunner`

Suggested files:

```text
skyth/core/session/agent-session.ts
skyth/core/threads/thread.ts
skyth/core/threads/thread-graph.ts
skyth/core/threads/thread-router.ts
skyth/core/run/orchestrator.ts
skyth/core/run/step-runner.ts
skyth/core/context/context-builder.ts
skyth/core/events.ts
skyth/core/providers/provider.ts
skyth/core/tools/tool-context.ts
skyth/core/tools/tool-executor.ts
skyth/core/policies/tool-loop-policy.ts
skyth/core/policies/permission-policy.ts
skyth/core/policies/concurrency-policy.ts
skyth/core/policies/compaction-policy.ts
skyth/core/delegation/delegation-controller.ts
skyth/core/capabilities/registry.ts
skyth/core/capabilities/manifest-schema.ts
skyth/core/capabilities/ax-schema.ts
skyth/core/capabilities/lifecycle.ts
skyth/core/memory/provider.ts
skyth/core/memory/quasar-memory-provider.ts
skyth/quasar/client.ts
```

## Capability Direction

Expose one capability management surface:

```text
capability_search
capability_view
capability_manage
capability_test
capability_promote
capability_archive
```

Kinds:

```text
tool
mcp
skill
pipeline
agent
prompt
memory_provider
channel
```

Lifecycle:

```text
scratch -> temporary -> candidate -> permanent -> core
```

Default policy:

- allow proactive scratch/temporary creation
- require validation and approval for permanent promotion
- require explicit approval for permanent tools and MCPs
- never expose core source editing outside developer mode

## Thread Direction

Skyth should rename user-facing sessions to threads.

Default model:

- every surface/channel can have its own active thread
- web, TUI, Android, CLI, Telegram, Discord, WhatsApp, Slack, MCP clients, browser adapters, and cron can all create threads
- channel adapters map inbound messages to active thread bindings
- different surfaces get different threads by default
- threads can be switched, forked, compacted, handed off, and merged

Carry forward the gateway thread tooling:

- `thread:read`
- `thread:search`
- `thread:handoff`
- `thread:compact`
- `thread:list`
- `thread:switch`
- `thread:merge`

Keep compatibility aliases:

- `session:search` should map to `thread:search`
- `/session` in Telegram should become the thread list/switch/create command surface
- MCP `sessionId` should remain transport metadata but should not become the durable Skyth user model

Quasar should persist:

- thread records
- active thread bindings per surface/channel/user/chat scope
- thread graph edges
- handoff summaries
- compaction summaries
- merge audit records
- run/message/event membership

Merge policy:

- do not silently merge users in shared channels
- preserve source thread identity and audit
- require approval for cross-user, cross-channel, or security-sensitive merges
- default group-channel behavior should be per-user threads when identity exists

## `.ax` Direction

Add schema-validated `agent.ax.json` sidecars next to manifests/skills/tools/pipelines/MCP configs.

Purpose:

- activation hints
- negative triggers
- prompt budget
- risk and approval hints
- safe/default modes
- handoff text
- usage learning and curator hints
- domain-aware decay metadata

Do not put executable code or secrets in `.ax`.

## Memory Direction

Use Quasar as the durable source of truth and expose MEMORY.md/USER.md-style prompt capsules as views.

Support pluggable providers like Hermes, but as adapters:

```text
primary: quasar
mirrors: optional external providers
retrievalProviders: quasar plus optional external search providers
```

Use staged retrieval, not one fused score:

```text
semantic candidates -> scope filter -> domain-aware decay -> salience rerank -> bounded capsules
```

The DRAG/Lightcone paper in `~/dev/experiments/drag` is the design rationale for avoiding fused heterogeneous retrieval scoring and using domain-aware decay.

## Reference Harness Lessons

- opencode: copy the inner loop shape, not the whole harness.
- Hermes: copy guardrails, skill creation pressure, curator lifecycle, and memory provider registry ideas.
- OpenClaw: copy orchestration/lifecycle/install-import philosophy.
- Legacy Skyth TS: preserve UX, context builder behavior, session graph, delegation safety, and memory ergonomics.
- Claude Gateway: import MCP/channel/registry/gateway maturity, including thread tools and `/session`-style channel behavior, then make provider-neutral.

## Verification Expectations

After the first import/normalization slice:

```bash
bun run typecheck
bun test tests/
bunx @biomejs/biome lint
```

Skip `./scripts/loc_check.sh` until it exists; repo instructions say it currently does not.

## Known Risks

- `claude-gateway` has large files and relative imports that violate Skyth rules.
- Some Claude-specific names should become compatibility aliases, not core concepts.
- Gateway-local durable stores should not become long-term authorities; migrate behind Quasar adapters.
- Skill/tool/MCP auto-creation can pollute the system unless lifecycle quotas and promotion gates land early.
- `.ax` must stay sidecar metadata, not a second executable manifest.
