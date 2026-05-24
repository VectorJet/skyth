# Progress - 2026-05-24

## Current Focus

Skyth is pivoting from its custom AI SDK/provider layer to a Pi-based runtime foundation.

## Completed

- Created `vendor/` at the repository root.
- Cloned Pi into `vendor/pi` from `refs/harnesses/pi`.
- Inspected Pi package structure:
  - `vendor/pi/packages/ai` provides model/provider registry and streaming APIs.
  - `vendor/pi/packages/agent` provides the generic agent loop and tool execution lifecycle.
  - `vendor/pi/packages/coding-agent` provides a higher-level session runtime and SDK surface.
  - `vendor/pi/packages/tui` is terminal UI support and is not on the immediate gateway path.
- Investigated Skyth surfaces currently coupled to provider/runtime logic.

## Findings

- Skyth provider logic is spread across:
  - `skyth/providers/*`
  - `skyth/base/base_agent/runtime/step-runner.ts`
  - `skyth/base/base_agent/runtime/agent_loop_runner.ts`
  - `skyth/base/base_agent/runtime/orchestrator.ts`
  - `skyth/base/base_agent/runtime/message_processor.ts`
  - `skyth/base/base_agent/runtime.ts`
  - session router files under `skyth/base/base_agent/session/core/router/`
  - CLI/config/onboarding provider catalog files.
- Pi's model boundary is `Model` + `Context` + `streamSimple()` / `completeSimple()`.
- Skyth's current model boundary is `LLMProvider.chat()` returning `LLMResponse`.
- The first low-risk migration slice is an adapter around `StepRunner`, because it has a contained input/output contract and is already used by `AgentRunOrchestrator`.
- The larger migration is replacing `AgentLoop` / `processMessageWithRuntime` with Pi agent/session semantics after the StepRunner adapter proves an end-to-end gateway turn.

## Recommended Next Step

Create a `skyth/pi-adapter/` module that converts:

- Skyth `provider/model` strings to Pi `getModel(provider, model)`.
- Skyth OpenAI-style messages to Pi `Context.messages`.
- Skyth tool definitions to Pi TypeBox `Tool` definitions.
- Pi assistant events back to Skyth `RunEvent` / `StepRunResult`.

Do this before deleting `skyth/providers/*`.
