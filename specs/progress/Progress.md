# Progress

Updated: 2026-05-22T08:45:00Z

## Current Focus

Cleaned the current `skyth/` tree after copying the legacy agent architecture so it no longer duplicates gateway-owned architecture namespaces.

## Completed

- Preserved `legacy(ts)` untouched.
- Kept the copied legacy base-agent and generalist architecture in current `skyth/`:
  - `skyth/base/base_agent/*`
  - `skyth/base/tool.ts`
  - `skyth/agents/*`
  - `skyth/agents/generalist_agent/agent_manifest.json`
  - `skyth/agents/generalist_agent/tools/*`
- Removed old duplicate top-level namespaces from current `skyth/`:
  - `skyth/registries`
  - `skyth/memory`
  - `skyth/sdks`
  - `skyth/auth`
  - `skyth/permission`
  - `skyth/logging`
  - `skyth/bus`
  - `skyth/session`
- Relocated legacy support modules under their current owners:
  - bus/logging/session/auth/sdk/manifest/memory under `skyth/base/base_agent/*`
  - old agent registry under `skyth/agents/registry.ts`
  - old tool registry under `skyth/base/base_agent/tools/registry.ts`
  - permission type under `skyth/agents/permission/next.ts`
- Removed obsolete copied top-level MCP registry because gateway owns MCP registry/runtime under `skyth/gateway/registries/mcp/*`.
- Patched all imports away from the deleted top-level namespaces.
- Kept `skyth/core/index.ts` as a narrow compatibility/export surface for manifest/registry helpers plus base-agent/agents exports, not as a second runtime layer.

## Verification

- `./node_modules/.bin/tsc --noEmit` passed.
- `./scripts/loc_check.sh` passed:
  - Files >= 400 LOC: 0
  - Files close to 400 LOC: 18
- Audit confirmed no stale imports remain for deleted top-level namespaces:
  - `@/registries/*`
  - `@/memory/*`
  - `@/sdks/*`
  - `@/auth/*`
  - `@/permission/*`
  - `@/logging/*`
  - `@/bus/*`
  - `@/session/*`

## Notes

- The current architecture is now clearer:
  - `skyth/gateway/*` owns the new gateway registries, loaders, runners, meta-tools, MCP, memory store, and capability runtime.
  - `skyth/base/base_agent/*` owns the copied legacy base-agent runtime and its private support modules.
  - `skyth/agents/*` owns concrete agent definitions and agent-local tools.
- The copied legacy base-agent still has its own local tool registry at `skyth/base/base_agent/tools/registry.ts`. The next integration should bridge that registry to gateway `execute_tool`/runners or replace parts of it with gateway-native execution.

## Next Steps

1. Add a gateway adapter for base-agent tool execution.
2. Wire copied generalist/base-agent runtime into current gateway channel queue / agent runner path.
3. Implement `delegate` and `task` as gateway meta-tools using copied base-agent delegation/session machinery.
4. Decide whether `skyth/core/index.ts` is still useful after consumers migrate to `skyth/base` and `skyth/gateway` imports.
5. Commit the legacy architecture copy plus cleanup after review.
