# Handoff - Core Agent Loop Harness Review

Date: 2026-05-19

## Summary

Reviewed the core agent-loop architecture across reference harnesses and legacy Skyth to recommend a Skyth direction.

## Harness Notes

- opencode: best inner model/tool loop shape. Its `tool-runtime.ts` cleanly owns streamed model events, step indexing, usage accumulation, tool dispatch, follow-up request creation, and bounded stop conditions.
- Hermes: strongest production hardening around invalid tool names, invalid JSON, provider weirdness, interrupts, iteration budget, memory prefetch, and user steer injection. The lesson is to keep these defenses, but move them into focused policies rather than one monolithic loop.
- OpenClaw: best outer orchestration. `agent-command.ts` separates session/bootstrap/model fallback/lifecycle/delivery from the embedded harness attempt.
- Codebuff: best SDK host boundary. `run.ts` exposes tools, files, MCP, stream chunks, cancellation, and partial run state through callbacks and explicit session state.
- Legacy Skyth: already has registries, session graph, memory, delegation safety, and tool discovery. It needs clearer separation between orchestration and step execution.

## Recommended Skyth Architecture

Implement a two-layer runtime:

1. `AgentRunOrchestrator`
   - Owns inbound channel messages, session routing, Quasar priority, heartbeat/cron scheduling, lifecycle events, model fallback, cancellation, delivery, and run persistence.
   - Calls one harness-neutral step runner.

2. `StepRunner`
   - Owns the repeated model/tool loop:
     - build request context
     - stream provider response
     - normalize assistant content/tool calls
     - validate and policy-check tool calls
     - execute tools with bounded concurrency
     - append tool results
     - stop or continue by explicit stop conditions
   - Emits typed step, model, tool, warning, usage, and finish events.

All extensibility should stay registry/manifest based: providers, channels, tools, agents, skills/plugins, and memory providers. Quasar should be the durable event/session state authority, while harnesses remain adapters around the same run protocol.

## Suggested Next Work

- Define `AgentRun`, `AgentStep`, `ToolCall`, `ToolResult`, and `RunEvent` schemas.
- Extract legacy loop defensive behavior into policy modules.
- Implement the StepRunner against existing provider/tool registries.
- Wrap it with an orchestrator that routes through Quasar and preserves existing session/delegation behavior.

## Verification

Review only. No runtime code changed.

`./scripts/loc_check.sh` was skipped because repository instructions state the script currently does not exist.
