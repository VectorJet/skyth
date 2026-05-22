# Handoff - Gateway Tool and Agent Registry Alignment

Date: 2026-05-22

## Summary

Started aligning the copied base-agent architecture with the requested registry direction:

- tools now flow through the gateway tool registry;
- agents are discoverable from built-in and user roots;
- subagents are discovered under their parent agent directories;
- Hermes memory/plugin architecture was reviewed for the next porting slice.

## Files Changed

```text
skyth/base/base_agent/tools/registry.ts
skyth/base/base_agent/tools/gateway_adapter.ts
skyth/base/base_agent/tools/gateway_runtime.ts
skyth/base/base_agent/tools/workspace_command.ts
skyth/base/base_agent/memory/provider.ts
skyth/base/base_agent/memory/manager.ts
skyth/base/base_agent/index.ts
skyth/agents/registry.ts
skyth/gateway/registries/agents/types.ts
skyth/gateway/registries/agents/registry.ts
skyth/gateway/registries/agents/index.ts
skyth/gateway/lifecycle/initialization.ts
tests/gateway_tool_runtime.test.ts
tests/gateway_agent_registry.test.ts
specs/progress/Progress.md
specs/handoffs/2026-05-22-gateway-tool-agent-registry-alignment.md
```

## Tool Registry Direction

`skyth/base/base_agent/tools/registry.ts` still exports `ToolRegistry` for compatibility with copied legacy code, but it now backs registrations with:

```text
skyth/gateway/registries/tools/ToolRegistry
```

The wrapper:

- converts legacy JSON-schema parameters to gateway `ToolParameter[]`;
- converts gateway parameters back to OpenAI function-call schemas for prompt/tool definition exposure;
- routes `execute()` through gateway `executeTool()`;
- preserves legacy scope metadata for `scopeOf()` and `toolsByScope()`;
- exposes `getGatewayRegistry()` for future runner wiring.

Helper modules were split out to keep `registry.ts` below the 400 LOC policy:

- `gateway_adapter.ts`: legacy/gateway tool shape conversion.
- `workspace_command.ts`: workspace script discovery and command-tool execution.

## Gateway ToolRuntime Adapter

`skyth/base/base_agent/tools/gateway_runtime.ts` adds `GatewayToolRuntime`, which implements the hybrid loop `ToolRuntime` interface.

It exposes:

- gateway registered tools;
- gateway meta-tools such as `find_tools`, `list_tools`, `batch_tools`, `wait`, and `tool_result`;
- `pipeline:<name>` tools;
- `skill:<name>` tools;
- `mcp:<server_tool>` tools.

Execution goes through `executeToolDirect()` so the gateway remains the authority for meta routing, prefixed capability routing, and formatted results.

`initializeRegistries()` now returns `toolRuntime` in addition to the registries and runtime services.

## Agent Registry Direction

`skyth/gateway/registries/agents/*` now owns gateway-style agent discovery. It discovers:

```text
skyth/agents/<agent_name>/agent_manifest.json
~/.skyth/agents/<agent_name>/agent_manifest.json
skyth/agents/<agent_name>/subagents/<subagent_name>/agent_manifest.json
~/.skyth/agents/<agent_name>/subagents/<subagent_name>/agent_manifest.json
```

`skyth/agents/registry.ts` is now a compatibility facade over the gateway registry discovery. The generalist remains the built-in top-level agent. Future generated agents and subagents can use the same manifest contract.

## Hermes Reference Notes

Relevant Hermes reference files reviewed:

```text
refs/harnesses/hermes-agent/agent/memory_provider.py
refs/harnesses/hermes-agent/agent/memory_manager.py
refs/harnesses/hermes-agent/hermes_cli/plugins.py
refs/harnesses/hermes-agent/agent/tool_executor.py
```

Port the architecture, not the Python runtime:

- `MemoryProvider` lifecycle: initialize, system prompt block, prefetch, queue prefetch, sync turn, tool schemas, tool dispatch, shutdown.
- `MemoryManager`: built-in memory plus at most one external provider; provider failures should not block the runtime.
- Plugin manager: bundled/user/project/package discovery, opt-in user/project plugins, lifecycle hooks.
- Tool executor: pre-tool plugin hooks, guardrails, bounded concurrency, ordered result append, non-crashing tool errors.

## Memory Contract Added

The first TypeScript memory contract now exists under `skyth/base/base_agent/memory/`:

- `provider.ts` defines `MemoryProvider` and lifecycle context types.
- `manager.ts` defines `MemoryManager`, which accepts built-in providers and rejects a second external provider.
- Provider failures are converted to warnings through an optional `onWarning` callback and do not throw through the runtime.
- Prefetch output is fenced with `<memory-context>` and sanitized if a provider returns pre-wrapped context.
- Provider tool schemas are indexed and dispatched through `handleToolCall()`.

This is not wired into the agent loop yet.

## Verification

```text
bun run typecheck
bun test tests/
bunx @biomejs/biome format --write skyth/base/base_agent/tools/registry.ts skyth/agents/registry.ts
bunx @biomejs/biome format --write skyth/base/base_agent/memory/provider.ts skyth/base/base_agent/memory/manager.ts skyth/base/base_agent/index.ts
./scripts/loc_check.sh
```

All passed. `bun test tests/` ran 2 focused tests with 0 failures. LOC check reports 0 files >= 400 LOC.

## Next Steps

1. Inject `toolRuntime` into `SkythAgentSession` / gateway route construction once provider construction is selected.
2. Implement Quasar-backed memory providers behind the new TypeScript memory contracts.
3. Add plugin lifecycle hooks around model calls, tool calls, thread/session boundaries, and gateway dispatch.
4. Implement `delegate` and `task` as gateway meta-tools.
