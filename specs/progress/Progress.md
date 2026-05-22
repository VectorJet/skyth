# Progress

Updated: 2026-05-22T07:45:00Z

## Current Focus

Specified and wired the first compile-safe Skyth hybrid agent loop slice, then corrected the folder ownership to match the legacy base-agent/generalist architecture and gateway meta-tool ownership.

## Completed

- Added `specs/core/hybrid-agent-loop.md` describing the selected hybrid loop:
  - opencode-style inner step/tool continuation;
  - Hermes-style provider/tool hardening policies;
  - legacy Skyth base-agent/generalist/specialist/subagent architecture;
  - Codebuff-style embeddable host boundary;
  - OpenClaw-style outer orchestration philosophy.
- Cross-checked imported gateway meta-tool architecture:
  - `execute_tool` already handles direct dispatch and prefixed MCP/pipeline/skill routing;
  - `batch_tools` already provides bounded parallelism and ordered results;
  - gateway `ToolDefinition`/registry shape is compatible with the new base-agent `ToolRuntime` adapter concept.
- Moved the first-pass runtime into the old folder vocabulary:
  - reusable base runtime under `skyth/base/base_agent/*`;
  - concrete generalist agent under `skyth/agents/generalist_agent/*`;
  - `skyth/core/*` remains as compatibility re-exports for now.
- Added base/generalist agent abstractions:
  - `skyth/base/base_agent/agent.ts`
  - `skyth/agents/generalist_agent/agent.ts`
- Added run/event contracts:
  - `skyth/core/events.ts`
  - `skyth/base/base_agent/runtime/types.ts`
- Added delegation safety controller:
  - `skyth/base/base_agent/delegation/controller.ts`
  - Supports bounded depth, subagent no-delegate, circular-call prevention, and already-visited prevention.
- Added loop policy helpers:
  - `skyth/base/base_agent/runtime/provider-recovery.ts`
  - `skyth/base/base_agent/runtime/tool-loop-policy.ts`
  - `skyth/base/base_agent/runtime/output-policy.ts`
- Added bounded-concurrency tool dispatch boundary:
  - `skyth/base/base_agent/tools/executor.ts`
- Replaced the placeholder StepRunner with a real first-pass loop at `skyth/base/base_agent/runtime/step-runner.ts`:
  - provider call per step;
  - final step disables tools;
  - streaming deltas are normalized into core events;
  - tool calls are recorded and loop-checked;
  - tool results are appended in original call order;
  - provider error recovery and tool-result fallback are wired;
  - final-answer nudge is wired when the provider returns empty content.
- Updated `AgentRunOrchestrator` to use `GeneralistAgent` by default and accept injected provider/tools.
- Updated `SkythAgentSession` and exports.
- Updated provider base contract so `LLMProvider.chat()` accepts `stream` and `onStream`.

## Verification

- `bun x tsc --noEmit` passed after the initial implementation.
- `bun x tsc --noEmit` passed again after moving files into legacy-style folders.
- `./scripts/loc_check.sh` passed before the folder reshuffle with 0 files >= 400 LOC. Re-run after the next wiring slice.

## Notes

- `delegate` and `task` should be gateway tools, probably under `skyth/gateway/meta/tools/`, not base runtime files.
- The base runtime should expose child-run/delegation contracts and safety checks; gateway tools should call those contracts.
- The next bridge should adapt gateway registry/execution into `ToolRuntime` instead of making `StepRunner` know about gateway internals.
- `AgentRunOrchestrator` currently requires injected provider/tools. Without a provider it emits a warning and finishes with `missing-provider`.
- `StepRunner` currently returns a `StepRunResult` through async-generator return value. This is usable by direct iteration semantics but awkward for consumers; a future pass may wrap events/results in a cleaner `RunStream` helper or emit a final internal event.

## Next Steps

1. Add a gateway-to-base-agent `ToolRuntime` adapter, likely near the gateway integration boundary.
2. Add `delegate` and `task` gateway meta-tools that call `DelegationController` and spawn child `AgentRunOrchestrator` runs.
3. Move thread/session context building from legacy/gateway compatibility into a provider-neutral `ContextBuilder` under `skyth/base/base_agent/context/`.
4. Persist run events and thread membership into Quasar.
5. Add tests for StepRunner: final answer, tool call continuation, provider error fallback, repeated tool loop, cancellation, and final-step no-tools behavior.
