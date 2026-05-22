# Gateway Tool Runtime Session Wiring Handoff

Date: 2026-05-22

## Summary

This slice connects the previously-created `GatewayToolRuntime` into the actual `SkythAgentSession` / gateway execution construction path and builds the initial `delegate` / `task` behavior on top of the session-owned `SubagentManager`. It also wires plugin hooks, memory providers, Quasar-backed memory, Quasar run event persistence, background delegate announcement routing, and hybrid-first gateway channel execution.

## Key Changes

- `skyth/core/session/agent-session.ts`
  - `SkythAgentSession` now accepts `AgentRunOrchestratorOptions`.
  - Passing `tools: toolRuntime` now reaches `AgentRunOrchestrator` and the hybrid model loop.
  - When provider + workspace are present, the session creates a `SubagentManager` and registers it with the gateway delegation bridge.

- `skyth/gateway/gateway.ts`
  - Gateway startup now uses `toolRuntime` and `delegationServices` returned by `initializeRegistries()`.
  - It constructs an `AISDKProvider`, `PluginManager`, `MemoryManager` with `QuasarMemoryProvider`, durable stores, and a `SkythAgentSession`.
  - The created session is passed to `startChannelSubsystem()` as the gateway agent runner.
  - The same durable stores are shared with the channel subsystem to avoid duplicate durability initialization.
  - The session-owned subagent bus is bridged into the gateway router.

- `skyth/gateway/channels/index.ts`
  - Uses `createChannelTurnRunner()` to choose hybrid session execution or the web bridge.
  - Hybrid execution is the default primary path for non-Telegram turns.
  - `SKYTH_GATEWAY_RUNNER=web` restores web-bridge-first behavior with hybrid fallback.
  - Telegram-origin turns still skip gateway handling by default to avoid duplicate Rust relay injection; `SKYTH_GATEWAY_HANDLE_TELEGRAM=1` opts into gateway handling.

- `skyth/gateway/channels/agent-runner.ts`
  - New pure runner helper for hybrid-first, web-first, and web-fallback channel behavior.

- `skyth/gateway/channels/subagent-announcements.ts`
  - Converts subagent completion bus messages into channel-origin internal turns and enqueues them into the gateway router.

- `skyth/gateway/durable/*`
  - Adds `DurableRunEventStore`.
  - Adds `QuasarRunEventAdapter`, persisting hybrid run events into Quasar VFS paths under `runs/<runId>/...` when Quasar adapters are active.

- `skyth/base/base_agent/runtime/orchestrator.ts`
  - Accepts `memoryManager`, `workspace`, and `runEventSink`.
  - Fires plugin session start/end hooks.
  - Initializes memory per thread.
  - Injects memory system prompt and prefetched context into model messages.
  - Exposes memory tools alongside the injected tool runtime.
  - Syncs completed turns back to memory.
  - Records emitted `RunEvent`s through the configured sink.

- `skyth/base/base_agent/delegation/manager.ts`
  - Added `executeInline()` for synchronous subagent task execution.
  - Shared the subagent loop and tool registry setup between inline and background execution.

- `skyth/gateway/meta/tools/task_tool.ts`
  - `task` now calls `executeInline()` and returns the result in the tool response.
  - `delegate` remains a background tool.

- `skyth/base/base_agent/runtime/step-runner.ts`
  - Fixed final result propagation by yielding `StepRunResult`; returning from the async generator made the orchestrator miss the result.

## Tests

Added:

- `tests/gateway_tool_runtime_injection.test.ts`
- `tests/task_tool.test.ts`
- `tests/delegate_tool.test.ts`
- `tests/agent_orchestrator_memory.test.ts`
- `tests/agent_orchestrator_plugin_session.test.ts`
- `tests/gateway_channel_agent_runner.test.ts`
- `tests/agent_orchestrator_run_events.test.ts`
- `tests/subagent_announcements.test.ts`

Verified:

- `bunx @biomejs/biome format --write ...`
- `bunx @biomejs/biome lint ...`
- `bun run typecheck`
- `bun test tests/`

## Remaining Work

- Add a dedicated Quasar IPC operation for run/session events if Quasar grows beyond VFS-backed event JSON.
- Add startup-level integration tests around provider configuration loading and full gateway boot.
