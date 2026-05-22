# Handoff - Skyth Cleanup Around Gateway Boundary

Date: 2026-05-22

## Summary

Cleaned current `skyth/` after copying the legacy TypeScript agent architecture. The old copied top-level architecture namespaces were either moved under their owning legacy base-agent/agent folders or removed, leaving `skyth/gateway/*` as the only gateway-style architecture owner.

`legacy(ts)` was not touched.

## Removed Top-Level Current Namespaces

These no longer exist under current `skyth/`:

```text
skyth/registries
skyth/memory
skyth/sdks
skyth/auth
skyth/permission
skyth/logging
skyth/bus
skyth/session
```

## Relocated Legacy Support

```text
skyth/base/base_agent/bus/*
skyth/base/base_agent/logging/*
skyth/base/base_agent/session/core/*
skyth/base/base_agent/auth/superuser/*
skyth/base/base_agent/sdk/*
skyth/base/base_agent/manifest/*
skyth/base/base_agent/memory/backend.ts
skyth/base/base_agent/memory/backends/static_sqlite.ts
skyth/base/base_agent/tools/registry.ts
skyth/agents/registry.ts
skyth/agents/permission/next.ts
```

## Gateway Boundary

Gateway remains the owner of the new architecture:

```text
skyth/gateway/registries/*
skyth/gateway/loaders/*
skyth/gateway/runners/*
skyth/gateway/meta/tools/*
skyth/gateway/memory/*
skyth/gateway/core/*
```

The old copied top-level MCP registry was removed because gateway already owns MCP registry/runtime.

## Verification

```text
./node_modules/.bin/tsc --noEmit
./scripts/loc_check.sh
```

Both passed. LOC check reports 0 files >= 400 LOC.

An import audit found no remaining stale imports for the deleted top-level namespaces:

```text
@/registries/*
@/memory/*
@/sdks/*
@/auth/*
@/permission/*
@/logging/*
@/bus/*
@/session/*
```

## Next Wiring Target

Bridge copied base-agent tool execution into gateway execution:

- base-agent local registry currently lives at `skyth/base/base_agent/tools/registry.ts`;
- gateway execution lives at `skyth/gateway/meta/tools/execute_tool.ts` and `skyth/gateway/runners/*`;
- future `delegate` and `task` should be gateway meta-tools, not base-agent-local tools.
