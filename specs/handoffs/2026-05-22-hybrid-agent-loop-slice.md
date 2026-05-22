# Handoff - Hybrid Agent Loop Slice

Date: 2026-05-22

## Summary

Specified and implemented the first compile-safe Skyth base-agent loop slice. After review, the runtime was moved back into the old folder vocabulary: reusable runtime in `skyth/base/base_agent/*`, concrete agents in `skyth/agents/*`, and gateway-facing delegation tools left for `skyth/gateway/meta/tools/*`.

## Reference Decision

The selected architecture is a hybrid:

- opencode: inner step/tool/follow-up loop shape.
- Hermes: provider recovery, malformed/tool hardening, guardrail direction.
- legacy Skyth TS: base agent, generalist, session/memory/delegation UX and folder structure.
- Codebuff: embeddable host boundary.
- OpenClaw: orchestration/cron/isolated-run philosophy.

The detailed spec lives at:

```text
specs/core/hybrid-agent-loop.md
```

## Gateway Compatibility Check

The imported gateway meta-tools architecture is compatible with the base-agent loop shape:

- `execute_tool` provides direct tool dispatch and MCP/pipeline/skill prefixes.
- `batch_tools` already provides bounded parallelism and ordered results.
- gateway `ToolDefinition` and registry metadata can be adapted into the base-agent `ToolRuntime` interface.

Important ownership decision: future `delegate` and `task` should be gateway tools, likely under `skyth/gateway/meta/tools/`, not files inside the base runtime. They should call the base runtime's delegation contracts and child-run APIs.

## Files Added or Moved Into Legacy-Style Structure

```text
skyth/base/base_agent/agent.ts
skyth/base/base_agent/index.ts
skyth/base/base_agent/delegation/controller.ts
skyth/base/base_agent/delegation/index.ts
skyth/base/base_agent/runtime/index.ts
skyth/base/base_agent/runtime/orchestrator.ts
skyth/base/base_agent/runtime/step-runner.ts
skyth/base/base_agent/runtime/types.ts
skyth/base/base_agent/runtime/provider-recovery.ts
skyth/base/base_agent/runtime/tool-loop-policy.ts
skyth/base/base_agent/runtime/output-policy.ts
skyth/base/base_agent/runtime/policies.ts
skyth/base/base_agent/tools/executor.ts
skyth/base/base_agent/tools/index.ts
skyth/agents/generalist_agent/agent.ts
skyth/agents/index.ts
specs/core/hybrid-agent-loop.md
```

## Compatibility Re-exports

`skyth/core/*` remains as thin compatibility exports for now, including:

```text
skyth/core/agents/*
skyth/core/delegation/*
skyth/core/policies/*
skyth/core/run/*
skyth/core/tools/*
```

Prefer new imports from `@/base/base_agent/*` and `@/agents/*` going forward.

## Implemented Behavior

- `GeneralistAgent` is the default top-level agent.
- `AgentRunOrchestrator` accepts injected provider/tools and emits `run_start` / `run_finish`.
- `StepRunner` has a first-pass model/tool loop:
  - streams deltas into core events;
  - disables tools on the final step;
  - executes tools through `ToolExecutor`;
  - appends assistant tool calls and tool results to history;
  - detects repeated identical tool calls;
  - retries provider errors within a recovery budget;
  - falls back to recent tool results when finalization fails;
  - nudges for a final answer when the provider returns empty content.
- `ToolExecutor` runs tool calls with bounded concurrency and preserves result order.
- `DelegationController` implements the legacy call-stack safety rules in a small reusable module.

## Verification

- `bun x tsc --noEmit` passed after initial implementation.
- `bun x tsc --noEmit` passed again after moving files into legacy-style folders.
- `./scripts/loc_check.sh` passed before the folder move with 0 files >= 400 LOC. Re-run LOC after the next wiring slice.

## Caveats

- Core is not yet connected to the CLI, gateway routes, Quasar event persistence, or registry-loaded agent manifests.
- `AgentRunOrchestrator` currently emits `missing-provider` if constructed without a provider.
- `StepRunner` currently uses the async-generator return value for `StepRunResult`; callers that consume only yielded events will not see that result directly. Consider replacing this with a final internal result event or a small stream wrapper.
- Real `delegate` and `task` tools are not implemented yet. Only the safety controller exists.
- No tests were added in this slice.

## Recommended Next Steps

1. Add a gateway-to-base-agent `ToolRuntime` adapter.
2. Implement `delegate` and `task` gateway meta-tools using `DelegationController`.
3. Add a provider-neutral context builder and thread model under `skyth/base/base_agent/context/` before wiring gateway/CLI into the new runtime.
4. Persist run events into Quasar.
5. Add StepRunner unit tests before expanding behavior.
