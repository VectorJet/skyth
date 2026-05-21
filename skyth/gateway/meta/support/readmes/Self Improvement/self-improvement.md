# Self-Improvement Loop

The gateway is designed for agents to improve their working environment, but improvements must be grounded in real friction and validated through the same load path users depend on.

## Improvement Order

Prefer the least invasive improvement that solves the problem:

1. Use existing tools correctly.
2. Improve readme docs or runbook instructions.
3. Improve AX metadata so discovery routes better.
4. Create or refine a skill when the need is procedural.
5. Create a workspace tool for one focused repeatable action.
6. Create a pipeline for multi-step or long-running workflows.
7. Add an MCP server when an external provider or service owns a tool bundle.
8. Modify gateway internals only when the behavior cannot be solved through user-space capability surfaces.

## Discovery Improvements

Most agent failures start with poor discovery. Improve:

- `summary`: concise capability purpose.
- `category`: stable browsing group.
- `visibility`: appropriate exposure tier.
- `triggerPhrases`: phrases users naturally say.
- `whenNotToUse`: negative routing guidance.
- `relatedTools`: useful adjacent tools.
- `commonUses`, `followUps`, and `intentExamples`: practical routing examples.

Then verify with `find_tools` using realistic task phrasing.

## Capability Improvements

When adding a capability:

- Put user-specific tools/pipelines/skills/MCP in workspace roots.
- Use temporary roots for experiments.
- Keep builtin changes for gateway-owned behavior.
- Declare only permissions actually needed.
- Avoid dynamic code loading in local/generated capabilities.
- Return structured outputs with enough context to continue work.
- Add meaningful errors that identify missing input or external state.

## Regression Discipline

Before reporting completion:

1. Confirm files are in the intended space.
2. Confirm hot reload or restart picked them up.
3. Confirm hooks and logs show no new rejection.
4. Confirm discovery finds the capability.
5. Execute a minimal smoke input.
6. Re-check `changes_summary` or `git diff` for unintended edits.

Do not claim broad validation when only a smoke test was run. Say exactly what passed.

## When to Change Gateway Code

Modify gateway internals when the request is about:

- Meta-tool behavior.
- Discovery, execution, async run, or result formatting.
- Source layout, loaders, registries, runners, watchers, hooks, or routes.
- Builtin tool/pipeline/skill/MCP behavior.
- Gateway documentation in `src/meta/support/readmes`.

For user-specific automation, prefer workspace capability roots. Gateway internals should stay general.
