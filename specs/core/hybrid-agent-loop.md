# Hybrid Agent Loop Spec

Updated: 2026-05-22

## Intent

Skyth keeps the legacy base-agent architecture while replacing the old monolithic loop with a small, composable runtime. The loop is a hybrid of:

- opencode's clean step/tool continuation shape.
- Hermes' production hardening and tool guardrail discipline.
- legacy Skyth TypeScript's base-agent, generalist, session, memory, and delegation UX.
- Codebuff's embeddable host boundary.
- OpenClaw's orchestration philosophy for cron, heartbeat, and isolated runs.

The first implementation slice must compile, expose stable contracts, and avoid binding the core runtime to the imported gateway internals.


## Folder Ownership

Skyth should keep the old folder vocabulary because it communicates runtime boundaries better than a generic `core/agents` tree.

- `skyth/base/base_agent/*` owns reusable base-agent runtime, policies, context, delegation safety, and tool execution boundaries.
- `skyth/agents/*` owns concrete agent definitions such as `generalist_agent`, future `code_agent`, `research_agent`, and `data_agent`.
- `skyth/gateway/meta/tools/*` owns gateway-facing tools such as future `delegate` and `task`. These tools should call into the base-agent runtime rather than living inside it.
- `skyth/core/*` may remain as temporary compatibility exports while callers migrate to the legacy-style paths.

## Gateway Tool Compatibility

The imported gateway meta-tools architecture is compatible with the new loop shape. It already has:

- registry-backed `ToolDefinition` objects;
- `execute_tool` direct dispatch;
- `batch_tools` bounded parallelism with ordered results;
- prefixed `mcp:`, `pipeline:`, and `skill:` routing;
- formatted tool-result normalization.

The next adapter should expose gateway tools through the base-agent `ToolRuntime` interface:

```ts
interface ToolRuntime {
  getDefinitions(): Array<Record<string, unknown>>;
  execute(name: string, args: Record<string, unknown>, context: ToolExecutionContext): Promise<unknown>;
}
```

That adapter should live near the gateway integration boundary, not in `StepRunner`.

## Runtime Layers

### AgentSession

Public host boundary used by CLI, gateway, cron, tests, and future SDK surfaces.

Responsibilities:

- Accept user input and run options.
- Select an agent, defaulting to the generalist.
- Return typed run events as an async iterable.

### AgentRunOrchestrator

Outer runtime. This is where thread/channel/session concerns belong.

Responsibilities:

- Resolve thread id and run id.
- Select base/generalist/specialist/subagent runtime metadata.
- Build the initial message context.
- Call the StepRunner.
- Emit lifecycle events.
- Persist to Quasar later.
- Own future thread merge, handoff, compaction, heartbeat, cron, and delivery integration.

### StepRunner

Inner model/tool loop. This must stay harness-neutral.

Responsibilities:

- Call the provider with messages and tool definitions.
- Accumulate assistant content, reasoning, usage, and tool calls.
- Disable tools on the final step to force a final answer.
- Execute model-requested tools through ToolExecutor.
- Append assistant/tool messages to the request history.
- Continue until stop condition, cancellation, provider failure, repeated tool loop, or final answer.
- Emit typed run events for every meaningful transition.

### ToolExecutor

Tool dispatch boundary.

Responsibilities:

- Accept normalized tool calls.
- Enforce delegation and permission policy hooks.
- Execute calls with bounded concurrency.
- Preserve result order when appending tool results.
- Return tool errors as tool results instead of crashing the run.

## Agent Hierarchy

Skyth keeps the legacy three-tier model.

```text
GENERALIST
  -> specialized agents: code, research, data, etc.
       -> disposable subagents: debug, test, parser, etc.
```

### BaseAgent

All agents share:

- id, name, role, tier, model preferences.
- system prompt construction.
- tool allowlist.
- child/subagent metadata.
- optional max steps and temperature defaults.

### GeneralistAgent

The default top-level agent.

- Full user/thread context.
- Broad tool access.
- Can delegate horizontally to specialized agents.
- Can create vertical subagents through controlled tools.
- Owns user-facing synthesis.

### Specialized Agents

Domain agents with narrower prompts and tool scopes.

- May call other specialized agents once per execution path.
- May create subagents if their manifest allows it.
- Must return results to parent/generalist rather than bypassing user-facing synthesis by default.

### Subagents

Disposable task workers.

- Narrow task context.
- Minimal tools.
- No delegation.
- Return structured results to parent.

## Delegation Safety

The first slice implements call-stack checks as a pure controller:

- bounded max depth;
- subagents cannot delegate;
- no circular calls;
- no repeated agent in the same execution path.

Later, `delegate` and `task` tools will call this controller before creating child runs.

## Stop Conditions

The StepRunner stops when any of these is true:

- abort signal is cancelled;
- max steps reached;
- provider returns a final answer with no tool calls;
- repeated identical tool call crosses the loop threshold;
- provider recovery budget is exhausted;
- policy asks for compaction or handoff.

On the final step, tools are not advertised. This nudges the provider to produce a final answer.

## Provider Recovery

Provider failures should not erase successful tool work.

Policy:

- Detect `Provider error:` responses.
- Retry recoverable provider errors with a short recovery system message.
- Back off on rate limits.
- If recent tool results exist, synthesize a fallback from those results.
- Otherwise emit a degraded-mode answer.

## Tool Loop Policy

The initial loop detector tracks recent `name + args` signatures.

Default:

- window: 6 calls;
- threshold: 3 repeats.

When tripped, emit a loop event and stop with the best available content. Later this can become an approval/permission question like opencode's doom-loop handling.

## Event Contract

Core events are provider-neutral and stable:

- `run_start`, `run_finish`
- `step_start`, `step_finish`
- `model_delta`, `reasoning_delta`, `model_complete`
- `tool_call`, `tool_result`, `tool_error`
- `loop_detected`
- `warning`

Gateway/UI adapters may transform these into richer surface-specific events.

## First Slice

Implement now:

- current spec file;
- core types;
- base/generalist agent classes;
- delegation controller;
- provider recovery and loop policy helpers;
- ToolExecutor;
- StepRunner loop wired to injected provider/tool definitions;
- AgentRunOrchestrator using GeneralistAgent by default;
- exports from `skyth/core/index.ts`;
- update progress and handoff docs.

Deferred:

- Quasar persistence of run events;
- real thread graph;
- registry-loaded agent manifests;
- real `delegate` and `task` tools;
- permission UI;
- compaction and handoff execution;
- gateway route replacement.
