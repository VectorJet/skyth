# Agent Architecture and SDK Review Handoff

## Scope

This handoff captures:

- the legacy Skyth agent architecture pulled from `legacy/spec/`
- the comparison against the Codebuff reference architecture under `refs/codebuff/`
- the review of current Skyth agent/SDK progress in the active `skyth/` codebase

Date: 2026-03-29

---

## Legacy Skyth Architecture Summary

Primary source files:

- `legacy/spec/arch.md`
- `legacy/spec/phase-2/agent-architecture.md`
- `legacy/spec/phase-2/README.md`

### Intended model

Skyth legacy specifies a hybrid delegation architecture with three tiers:

1. Generalist orchestrator
2. Specialized agents
3. Disposable subagents

Key rules from the legacy spec:

- Horizontal delegation: agent-to-agent via `delegate(agent, task, context_snapshot)`
- Vertical delegation: agent-to-subagent via `task(subagent, todo)`
- Subagents are narrow, disposable, minimal-context workers
- Subagents cannot delegate
- Circular calls must be prevented with call-stack tracking
- Context differs by tier:
  - Generalist and agents get broad/full context
  - Subagents get minimal structured context
- Discoverable agents are manifest-driven

### Important legacy expectations

- Agent manifests should be authoritative
- Registry-based discovery should be the source of truth
- Delegation safety should be enforced at runtime
- Agent roles should be explicit, not inferred ad hoc

---

## Comparison with Codebuff Reference Architecture

Primary reference files:

- `refs/codebuff/docs/architecture.md`
- `refs/codebuff/docs/agents-and-tools.md`
- `refs/codebuff/packages/agent-runtime/src/templates/agent-registry.ts`
- `refs/codebuff/common/src/types/agent-template.ts`
- `refs/codebuff/common/src/types/session-state.ts`
- `refs/codebuff/packages/agent-runtime/src/tools/handlers/tool/spawn-agents.ts`
- `refs/codebuff/packages/agent-runtime/src/tools/handlers/tool/spawn-agent-utils.ts`

### What Codebuff does well

- Uses a real agent runtime package as the execution core
- Has a clear `SessionState` and `AgentState` tree
- Supports prompt agents and programmatic agents
- Agent templates are typed and validated
- Child-spawn permissions are explicit through `spawnableAgents`
- Subagent spawning is part of the active runtime path, not just a spec
- Tool execution boundary is clear: runtime requests tools, SDK/client executes them

### Where Codebuff differs from legacy Skyth

- Codebuff does not hard-require a three-tier generalist/specialist/subagent role model
- Codebuff uses TypeScript agent templates, not JSON manifest files as the primary execution contract
- Codebuff largely unifies delegation under spawn semantics rather than preserving a hard distinction between peer delegation and subagent tasking
- Nested spawning is permission-based, not role-forbidden by default

### Recommended synthesis

Skyth should keep the stronger architectural policy layer from the legacy spec:

- explicit orchestrator role
- explicit distinction between peer delegation and subagent execution
- explicit circular-call prevention
- manifest-first discovery and automation contracts

Skyth should borrow the more practical runtime shape from Codebuff:

- typed agent definitions
- executable registry entries
- unified runtime state tree
- programmatic agents as first-class supported runtime objects
- session-aware spawn permissions

---

## Current Skyth Agent/SDK Review

### Files reviewed

- `skyth/sdks/agent-sdk/index.ts`
- `skyth/sdks/agent-sdk/define.ts`
- `skyth/sdks/agent-sdk/manifest.ts`
- `skyth/sdks/agent-sdk/types.ts`
- `skyth/sdks/agent-sdk/tools.ts`
- `skyth/sdks/agent-sdk/pipeline.ts`
- `skyth/sdks/agent-sdk/permissions.ts`
- `skyth/base/base_agent/lifecycle.ts`
- `skyth/base/base_agent/runtime.ts`
- `skyth/base/base_agent/runtime/agent_loop_runner.ts`
- `skyth/base/base_agent/runtime/message_processor.ts`
- `skyth/base/base_agent/delegation/manager.ts`
- `skyth/base/base_agent/delegation/call_stack.ts`
- `skyth/registries/agent_registry.ts`
- `skyth/registries/tool_registry.ts`
- `skyth/core/registry.ts`
- `skyth/core/manifest.ts`
- `skyth/agents/agents.ts`
- `skyth/agents/generalist_agent/agent.ts`
- `skyth/agents/generalist_agent/agent_manifest.json`
- `skyth/gateway/handlers/agents.ts`
- `skyth/gateway/handlers/tools.ts`
- `skyth/gateway/handlers/models.ts`
- `skyth/gateway/server/index.ts`
- `skyth/providers/registry.ts`

---

## Findings

### 1. The SDK surface exists, but most of it is not runtime-authoritative

Current SDK capabilities:

- `defineAgent`
- `defineTool`
- `definePipeline`
- manifest parsing
- permission derivation from manifest

What `defineAgent` currently does:

- validates the definition shape
- parses the manifest
- derives `global_tools`
- constructs `AgentLifecycle` with `enable_global_tools`

What it does not currently do:

- apply `context` config
- apply `memory` config
- apply `delegation` config
- apply `tools.autoDiscover` or `tools.globalAccess` except indirectly through `global_tools`
- wire lifecycle hooks into runtime execution

This means the SDK is currently descriptive and partially validated, but not yet the source of truth for runtime behavior.

### 2. Lifecycle hooks are defined but not executed

`LifecycleHooks` includes:

- `onInit`
- `onStart`
- `onMessage`
- `onToolCall`
- `onResponse`
- `onStop`
- `onDestroy`

But `AgentLifecycle` currently:

- constructs `AgentLoop`
- toggles a `started` flag
- forwards `processMessage`

There is no hook invocation path in the active lifecycle implementation.

### 3. Two incompatible agent models currently coexist

Model A:

- manifest-based discovery via `AgentRegistry`
- gateway APIs use registry metadata

Model B:

- hard-coded agent list in `skyth/agents/agents.ts`

Additional split:

- the active gateway runtime is started from the imported `generalist_agent` factory
- the registry does not load manifest entrypoints into executable factories

Impact:

- discovery and execution are not unified
- SDK-defined agents are not registry-backed executable units
- registry-based agents are only partially visible to runtime consumers

### 4. Registry work is real, but only for metadata discovery

What is working:

- manifest validation
- duplicate detection
- internal vs external discovery rules
- deterministic directory scanning

What is missing:

- loading `entrypoint`
- instantiating executable agent implementations from registry entries
- using registry entries as the authoritative runtime catalog

### 5. Tool autodiscovery is farther along than agent autodiscovery

`ToolRegistry` currently:

- scans core tool directories
- scans agent-local tool directories
- can ingest both SDK-style tool definitions and legacy tool objects
- supports workspace tool script discovery

This is more advanced than the agent side, where manifests are discovered but implementations are not activated through the registry.

### 6. Delegation safety logic exists, but it is not clearly enforced in the active spawn path

Good news:

- `DelegationCallStack` exists
- it captures:
  - no delegation from subagents
  - max depth checks
  - circular-call detection
  - repeated-visit blocking

Problem:

- the active `spawn` tool path calls `ctx.subagents.spawn(...)`
- `SubagentManager` runs the subagent directly
- there is no visible integration with `DelegationCallStack` in that path

Impact:

- the codebase contains the intended safety logic
- the runtime path appears able to bypass it

### 7. Subagent execution is implemented, but only as a background worker model

Current subagent behavior:

- spawn background task
- run a separate mini loop with a local tool registry
- announce a summarized result back to the originating conversation

This is useful, but narrower than the legacy architecture:

- there is no explicit peer-agent delegation model
- there is no clear distinction between specialist agents and subagents in the active runtime
- there is no evidence of the legacy `delegate(...)` mechanism being implemented as a first-class runtime primitive

### 8. Gateway `tools.effective` is still placeholder logic

The current implementation:

- takes `sessionKey`
- returns all tools scoped as `global` or `workspace`

It does not account for:

- the active agent
- manifest restrictions
- subagent restrictions
- future per-session or per-channel policy

This is sufficient for a temporary frontend API, but not for a correct SDK/runtime contract.

### 9. Gateway agent workspace resolution appears incorrect

`AgentRegistry` stores `entry.root` as the agent directory containing the manifest.

`gateway/handlers/agents.ts` currently resolves agent workspace as:

- `join(root, "skyth", "agents", agentId)`

If `root` is already the agent directory, this creates an invalid nested path.

Impact:

- `agents.identity`
- `agents.files.list`
- `agents.files.get`
- `agents.files.set`

may all target the wrong directory for discovered agents.

This should be fixed before relying on the gateway agent inspection API.

---

## Overall Status Assessment

### Current maturity

The current Skyth agent/SDK stack is in a transition state:

- there is real progress on the runtime
- there is real progress on manifest and registry infrastructure
- there is real progress on gateway APIs
- there is real progress on tool autodiscovery

But the system is not yet architecturally unified.

### Most complete areas

- runtime loop
- tool discovery
- manifest validation
- gateway surface expansion

### Least complete areas

- executable agent registry
- SDK fields actually driving runtime behavior
- unification of discovery and execution
- runtime enforcement of delegation policy
- accurate session/agent-specific effective tool calculation

---

## Recommended Next Steps

### Priority 1

Unify discovery and execution.

Target:

- `AgentRegistry` should load executable factories from manifest entrypoints
- the active runtime should instantiate agents through registry-backed factories
- remove or isolate the hard-coded fallback list in `skyth/agents/agents.ts`

### Priority 2

Make SDK definitions authoritative.

Target:

- wire lifecycle hooks into `AgentLifecycle`
- pass SDK delegation config into runtime/delegation manager
- pass SDK tool config into tool discovery / runtime policy
- pass SDK context and memory config into `AgentLoop`

### Priority 3

Fix agent gateway workspace resolution.

Target:

- agent identity/files endpoints should resolve the actual agent directory from the registry entry
- avoid rebuilding the path from `root` incorrectly

### Priority 4

Make delegation policy authoritative at runtime.

Target:

- route all delegation and spawning through one policy-aware manager
- enforce:
  - max depth
  - no subagent delegation
  - circular prevention

### Priority 5

Replace placeholder `tools.effective`.

Target:

- compute tools from:
  - active agent identity
  - manifest permissions
  - session mode
  - channel/session policy
  - subagent restrictions

---

## Practical Implementation Direction

Recommended target shape:

1. Keep manifest-first discovery
2. Add typed executable agent factories behind manifest entrypoints
3. Make registry entries load both metadata and implementation
4. Preserve explicit generalist/specialist/subagent roles from legacy Skyth
5. Preserve explicit delegation safety semantics from legacy Skyth
6. Borrow Codebuff’s stronger runtime state model and executable template approach

This gives Skyth:

- a stable automation contract
- better runtime cohesion
- less hard-coded wiring
- clearer frontend/gateway semantics
- room for future memory/delegation work without rewriting the platform contract later

---

## Open Risks

- Further gateway/frontend work may build on `tools.effective` and `agents.*` endpoints that are not yet semantically correct.
- Additional agents may be added through manifests without becoming executable through the current runtime path.
- Delegation bugs may remain latent because the safety layer is present in code but not clearly in the active spawn path.
- The SDK may appear more complete than it is, which creates a risk of downstream code depending on behaviors that are not implemented.

---

## Suggested Follow-Up Task

Create a concrete implementation plan for:

- registry-backed executable agents
- SDK-to-runtime wiring
- delegation policy enforcement
- gateway agent path fix
- session-aware `tools.effective`

That work should be done together, not piecemeal, because the current issues are architectural coupling problems rather than isolated bugs.
