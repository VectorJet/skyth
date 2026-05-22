# Progress

Updated: 2026-05-22T14:05:00Z

## Current Focus

The requested tool runtime, task/delegate, hybrid loop, plugin, memory, Quasar persistence, and gateway channel wiring slice is implemented and verified.

## Completed

- `initializeRegistries()` returns `delegationServices` alongside `toolRuntime`.
- `SkythAgentSession` accepts `AgentRunOrchestratorOptions`, including injected `ToolRuntime`, provider, workspace, plugin manager, memory manager, run event sink, and delegation services.
- `SkythAgentSession` creates a session-owned `SubagentManager` when provider + workspace are available and installs it into the gateway delegation bridge.
- Gateway startup constructs:
  - `AISDKProvider`
  - `PluginManager`
  - `MemoryManager` with `QuasarMemoryProvider`
  - durable stores from `createDurableStores()`
  - `SkythAgentSession` with the initialized `GatewayToolRuntime`
- The gateway channel runner is factored into `createChannelTurnRunner()`.
- Hybrid `SkythAgentSession` execution is the primary gateway runner by default for non-Telegram turns.
- Web bridge execution remains available with `SKYTH_GATEWAY_RUNNER=web` and falls back to the hybrid runner when the bridge fails.
- Telegram-origin turns still skip gateway injection by default to avoid duplicate Rust relay injection; `SKYTH_GATEWAY_HANDLE_TELEGRAM=1` opts into gateway handling.
- `AgentRunOrchestrator` now:
  - fires plugin session start/end hooks;
  - initializes memory per thread;
  - injects memory system prompt and prefetched context;
  - exposes memory provider tools through the same tool runtime;
  - syncs completed turns back to memory;
  - records emitted `RunEvent`s through a configured `RunEventSink`.
- Quasar durability now includes `QuasarRunEventAdapter`, which persists hybrid run events into Quasar VFS paths under `runs/<runId>/...` when Quasar adapters are active.
- `SubagentManager` supports `executeInline()` for synchronous task execution.
- `task` meta-tool runs inline and returns `{ mode, taskId, label, result }`.
- `delegate` remains background-oriented, and subagent background announcements are now bridged from the session bus into the gateway router as channel-origin internal turns.
- Fixed `StepRunner` result propagation by yielding the final `StepRunResult` from the async generator so `AgentRunOrchestrator` can populate `run_finish.output`.

## Tests Added

- `tests/gateway_tool_runtime_injection.test.ts`
  - Proves `SkythAgentSession` exposes gateway tool definitions to the provider and executes a model-requested gateway tool through `GatewayToolRuntime`.
- `tests/task_tool.test.ts`
  - Proves `task` runs a subagent inline and returns the result.
- `tests/delegate_tool.test.ts`
  - Proves `delegate` starts a background subagent and publishes a completion announcement.
- `tests/agent_orchestrator_memory.test.ts`
  - Proves memory prompt injection, memory tool execution, and turn sync.
- `tests/agent_orchestrator_plugin_session.test.ts`
  - Proves plugin session hooks fire around a hybrid run.
- `tests/gateway_channel_agent_runner.test.ts`
  - Proves hybrid-primary, web-primary, and web-fallback channel runner behavior.
- `tests/agent_orchestrator_run_events.test.ts`
  - Proves hybrid run events are recorded through the configured sink.
- `tests/subagent_announcements.test.ts`
  - Proves subagent bus messages are converted into gateway router turns.

## Verification

- `bunx @biomejs/biome format --write ...` passed for changed TypeScript files.
- `bunx @biomejs/biome lint ...` passed for changed TypeScript files.
- `bun run typecheck` passes.
- `bun test tests/` passes: 122 tests, 0 failures.
- LOC spot check for changed files: all changed code/test files are under 400 LOC.
- Required `./scripts/loc_check.sh` was not run because the repository instructions explicitly say the script currently does not exist and to skip it.

## Notes

- Quasar run event persistence uses the existing Quasar VFS write boundary because the current Quasar IPC protocol does not expose a dedicated `run_event_record` operation.
- Telegram handling remains opt-in for the gateway hybrid runner to avoid double-injecting messages already forwarded by the Rust relay.
