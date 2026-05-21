# Tool Surfaces

The gateway has several capability surfaces. Choose the smallest surface that matches the job.

## Builtin Tools

Builtin tools live in `src/builtin/tools/<name>`. They are gateway-owned and registered with source `builtin`. They are appropriate for core local operations such as reading files, editing files, shell execution, searching, patching, memory, thread inspection, media loading, and gateway diagnostics.

Use builtin source when the capability should ship with the gateway and be available to every workspace.

## Workspace Tools

Workspace tools live in `<CLAUDE_GATEWAY_WORKSPACE>/TOOLS/<name>`, or `~/.claude-gateway/workspaces/default/TOOLS/<name>` when the environment variable is unset. They are registered as `custom`, writable, hot reloadable, and checked as local source.

Use workspace tools for durable user or project-specific actions.

## Temporary Tools

Temporary tools live in `<workspace>/TEMP/tools/<name>`. They are writable, generated-trust capabilities for one-off or experimental helpers. Promote them to workspace tools only after they prove useful.

## Pipelines

Pipelines live in builtin, workspace, or temporary pipeline roots. They are selected with `pipeline:<name>` and use run tracking. Use them for workflows that are multi-step, long-running, artifact-producing, or need status/result retrieval.

## Skills

Skills are instruction bundles loaded from `SKILL.md`. They do not run code directly. They give the model reusable procedure, policy, examples, and optional resource files. Use `skill:<name>` through `execute_tool`, or `use_skill` directly, when the main value is guidance rather than an action.

## MCP Servers

MCP servers are external tool providers. They are discovered from MCP manifest directories and exposed as `mcp:<server>_<tool>` unless `exposeTools` is false. Use MCP when an external provider already exposes a tool bundle or when a separate service naturally owns multiple actions.

## Connected Apps

Composio is connected as a private backend MCP server. Its raw server can have `exposeTools: false`, so agents should use gateway-native `composio_*` meta-tools instead of raw `mcp:composio_*` calls.

## Decision Rule

- One short focused action: tool.
- Multi-step or long-running workflow: pipeline.
- Reusable model behavior or procedure: skill.
- External service/tool bundle: MCP server.
- OAuth-backed app action: Composio meta-tools.

When unsure, start with a workspace tool or skill. Add a pipeline only when run state or multi-step orchestration is actually needed.
