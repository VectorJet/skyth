# Progress

Updated: 2026-05-21T11:45:00Z

Completed architecture/spec discussion for Skyth Next runtime, stack, self-improvement, memory, capabilities, skills philosophy, and `.ax` sidecars.

New spec added:

- `specs/skyth-next-runtime-and-capabilities.md`

New handoff added:

- `specs/handoffs/2026-05-21-skyth-next-runtime-capability-spec.md`

Decisions captured:

- Keep TypeScript/Bun as the primary Skyth runtime.
- Keep Rust Quasar as the durable encrypted state authority.
- Use Python only as an optional plugin/tool runtime.
- Use `refs/harnesses/claude-gateway/mcp-gateway` as the gateway/MCP/channel/capability import baseline.
- Use legacy Skyth TypeScript for UX, context builder, delegation, session, and memory behavior inspiration.
- Build one core `AgentSession` API used by CLI, gateway, channels, cron, and tests.
- Use **threads** as the user-facing session primitive. Keep `session` as compatibility/transport terminology.
- Give every surface/channel its own default active thread binding: web, TUI, Android, CLI, Telegram, Discord, WhatsApp, Slack, MCP clients, browser adapters, and cron.
- Preserve and promote gateway thread tools such as `thread:read`, `thread:handoff`, `thread:search`, and `/session`-style channel switching.
- Preserve the legacy session graph concept as a thread graph with fork, merge, handoff, compaction, continuation, and link edges.
- Split runtime into `AgentRunOrchestrator` and `StepRunner`.
- Make the gateway a wrapper around the agent runtime, not the agent brain.
- Expose capability creation through one lifecycle-aware capability-management surface.
- Use lifecycle tiers: scratch, temporary, candidate, permanent, core.
- Be proactive about scratch/temporary capability creation, conservative about permanent promotion.
- Lean into Hermes-style local skill building while keeping OpenClaw-style install/import as distribution.
- Never mutate installed upstream skills directly by default; use local overlays/forks.
- Add schema-validated `agent.ax.json` sidecars for activation, risk, routing, UX, and lifecycle hints.
- Use Quasar-native structured memory with MEMORY.md/USER.md-compatible prompt capsules.
- Support pluggable memory providers as adapters/mirrors/retrieval sources, not as the default authority.
- Use staged memory retrieval and domain-aware decay based on the DRAG/Lightcone paper in `~/dev/experiments/drag`.

Recommended next implementation step:

1. Copy `refs/harnesses/claude-gateway/mcp-gateway` into `skyth/gateway`.
2. Normalize imports to `@/`.
3. Preserve registry/channel/MCP functionality first.
4. Add core runtime skeleton under `skyth/core`.
5. Add thread model/router/graph modules under `skyth/core/threads`.
6. Add manifest and `.ax` schemas.
7. Introduce a Quasar IPC client boundary before migrating gateway-local durable stores.

Verification:

- Documentation/spec update only.
- No code or test commands were run for this spec-writing step.
- `./scripts/loc_check.sh` skipped because repository instructions state the script currently does not exist.
