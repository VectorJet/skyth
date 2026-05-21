# Gateway Overview

Claude Gateway is a local capability layer that sits behind the model-facing MCP surface. The model normally sees a small control plane of meta-tools, not every local capability directly. Those meta-tools discover capabilities, expose compact inventories, execute the selected capability, handle long-running runs, and surface debug information.

The main model-facing meta-tools are:

- `gateway_readme`: reads these hot-reloadable docs from `src/meta/support/readmes`.
- `find_tools`: ranked task-specific discovery across tools, pipelines, MCP tools, and skills.
- `list_tools`: compact or full inventory with filters for `category`, `tag`, and `source`.
- `execute_tool`: dispatches a selected capability by name.
- `batch_tools`: executes multiple independent tool calls.
- `tool_watch`, `wait`, and `tool_result`: observe async tool runs.
- `gateway_debug`: inspect registries, logs, skipped MCP servers, and recent tool calls.
- `list_skills`, `create_skill`, and `use_skill`: manage skill bundles.
- `composio_*`: gateway-native wrappers around the private Composio MCP backend.

## How the Gateway Works

The gateway has five implementation layers:

1. Source layout: `src/sources/index.ts` defines builtin, workspace, and temporary roots. Each root has a capability type, write policy, and trust level.
2. Loaders: `RuntimeLoader` loads tools and pipelines from the source layout. `SkillLoader` and `MCPRegistry` handle skills and MCP servers. Loaders build load candidates and run hooks before registration when a hook manager is attached.
3. Registries: tools, pipelines, skills, and MCP servers are stored in separate registries. Registries validate basic definitions and expose stats.
4. Runners and dispatch: `execute_tool` dispatches based on prefixes, then runners call the correct registry. Plain names are tools, `pipeline:` names are pipelines, `skill:` names are skills, and `mcp:` names are raw MCP tools.
5. Watchers and reload caches: watchers detect source changes, loaders fingerprint directories, and TypeScript tools/pipelines are imported from `.gateway-reload-cache` so edits can be loaded again.

## First Moves for Agents

Start narrow:

1. Call `gateway_readme` with `list: true` or `category` when you need orientation.
2. Call `find_tools` with the actual user intent. Include negative constraints if the user gave them.
3. Call `list_tools` only for inventory, filtering, or exact schemas.
4. Use `execute_tool` when the exact name and arguments are known.
5. Use `async: true`, `tool_watch`, `wait`, or `tool_result` when the work may run long.
6. Use `gateway_debug`, `/debug`, `/debug/logs`, `/debug/calls`, `/health`, `/tools`, and `/pipelines` when behavior is surprising.

Avoid dumping broad schemas or full inventories unless exact arguments are needed. The gateway’s discovery path is designed to keep context small.

## Execution Prefixes

Use exact prefixes:

- Plain tool: `read`, `grep`, `bash`, `apply_patch`, `workspace_status`.
- Pipeline: `pipeline:<name>`.
- Skill: `skill:<name>`.
- Raw MCP tool: `mcp:<server>_<tool>`.
- Connected app workflow: gateway-native `composio_*`, not raw `mcp:composio_*`.

The raw MCP registry combines server and tool names with the first underscore as the split point. `mcp:context7_resolve-library-id` means server `context7`, tool `resolve-library-id`.

## Output Rules

Tools should return structured, useful data. Avoid placeholder success objects, null-heavy payloads, and empty arrays unless they communicate real state. Gateway output pruning removes common boilerplate, but the tool itself should still report what happened, what changed, and what remains.

For MCP-native multimodal output, `execute_tool` promotes `content` blocks so clients receive images/resources correctly. Text-only MCP content is mirrored into `structuredContent.text` for clients that do not render raw MCP content arrays well.
