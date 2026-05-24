# Handoff - Pi Vendor Investigation

Date: 2026-05-24

## Summary

Pi was cloned into `vendor/pi` from `refs/harnesses/pi` for local vendor/fork investigation. No Skyth runtime migration code was implemented in this pass.

Pi commit:

```text
fc51a40d
```

Branch:

```text
main
```

## Relevant Pi Packages

- `vendor/pi/packages/ai`
  - Provider/model registry, built-in provider implementations, streaming APIs.
  - Main surface: `getModel`, `getProviders`, `getModels`, `streamSimple`, `completeSimple`.
- `vendor/pi/packages/agent`
  - Generic agent loop and tool lifecycle.
  - Main surface: `agentLoop`, `Agent`, `AgentTool`, `AgentMessage`, `AgentLoopConfig`.
- `vendor/pi/packages/coding-agent`
  - Full coding-agent session runtime, tools, SDK, config, extension/resource loading.
  - Useful later if Skyth wants Pi sessions as the primary runtime.

## Skyth Affected Surface

Provider boundary:

- `skyth/providers/base.ts`
- `skyth/providers/ai_sdk_provider.ts`
- `skyth/providers/ai_sdk_resolver.ts`
- `skyth/providers/registry.ts`
- `skyth/providers/ai_sdk_provider_tools.ts`

Loop/runtime boundary:

- `skyth/base/base_agent/runtime/step-runner.ts`
- `skyth/base/base_agent/runtime/agent_loop_runner.ts`
- `skyth/base/base_agent/runtime/orchestrator.ts`
- `skyth/base/base_agent/runtime/message_processor.ts`
- `skyth/base/base_agent/runtime.ts`
- `skyth/agents/system.ts`

Session router/provider users:

- `skyth/base/base_agent/session/core/router/llm-classifier.ts`
- `skyth/base/base_agent/session/core/router/merge.ts`
- `skyth/base/base_agent/session/core/router/session-naming.ts`
- `skyth/base/base_agent/session/core/router/types.ts`

Config/onboarding/catalog users:

- `skyth/config/schema.ts`
- `skyth/config/defaults.ts`
- `skyth/cli/cmd/configure/pointers/model.ts`
- `skyth/cli/cmd/configure/pointers/provider.ts`
- `skyth/cli/runtime/commands/provider.ts`
- `skyth/api/routes/onboardingRoute.ts`

Gateway integration:

- `skyth/gateway/lifecycle/agent-session-boot.ts`
- `skyth/gateway/gateway.ts`
- `skyth/gateway/channels/*`

## Recommended Migration Order

1. Add `skyth/pi-adapter/` with pure conversion helpers.
2. Implement a Pi-backed `StepRunner` alternative or mode.
3. Run one `AgentRunOrchestrator` gateway turn through Pi.
4. Move session routing/naming to Pi-backed completion helpers.
5. Replace legacy `AgentLoop` / `message_processor` path.
6. Remove `skyth/providers/*` after both gateway and channel paths no longer import it.

## Notes

- Pi uses TypeBox tool schemas. Skyth currently uses JSON Schema-like function definitions. Tool schema conversion is a required adapter piece.
- Pi assistant messages separate text, thinking, and tool calls into content blocks. Skyth currently flattens content into `LLMResponse.content`, `reasoning_content`, and `tool_calls`.
- Pi has richer provider support than Skyth's current AI SDK wrapper and should own provider behavior rather than being wrapped behind Skyth's current `LLMProvider`.
