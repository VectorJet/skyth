# Handoff - Legacy Agent Architecture Copy

Date: 2026-05-22

## Summary

On top of commit `0c8ebc8`, replaced the hand-built base-agent scaffold in current `skyth/` with a wholesale copy of the legacy TypeScript base-agent and agent architecture. `legacy(ts)` was not modified.

## Copied Into Current Skyth

```text
skyth/base/base_agent/*
skyth/base/tool.ts
skyth/agents/*
skyth/bus/*
skyth/logging/*
skyth/memory/*
skyth/permission/*
skyth/registries/*
skyth/sdks/agent-sdk/*
skyth/session/*
skyth/core/manifest.ts
skyth/core/registry.ts
```

The generalist now includes:

```text
skyth/agents/generalist_agent/agent.ts
skyth/agents/generalist_agent/agent_manifest.json
skyth/agents/generalist_agent/tools/*
```

## Pruned

Removed old copied auth CLI/token/channel files from current `skyth/auth/`; kept only `skyth/auth/superuser/*` because the base-agent filesystem tool imports it.

Removed stale hand-built scaffold directories under `skyth/core/*` that had become incompatible after copying the legacy runtime.

## Verification

```text
bun x tsc --noEmit
./scripts/loc_check.sh
```

Both passed. LOC check reports 0 files >= 400 LOC.

## Important Direction

Do not rebuild a second agent loop in `skyth/core`. The copied legacy base-agent runtime should become the runtime. Gateway integration should be an adapter layer:

- gateway meta-tools remain under `skyth/gateway/meta/tools/*`;
- gateway runners/registries remain under `skyth/gateway/*`;
- base-agent tool execution should be wired to gateway `execute_tool` / runners;
- future `delegate` and `task` should be gateway meta-tools that call the copied base-agent delegation/session machinery.
