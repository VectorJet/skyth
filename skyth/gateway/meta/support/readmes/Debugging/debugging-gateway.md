# Debugging the Gateway

Debug from the outside in: confirm the capability is visible, confirm the registry loaded it, confirm hooks accepted it, then inspect the runner or transport path.

## First Checks

Use gateway tools first:

- `workspace_status`: cwd, git branch, dirty files, package manager, and scripts.
- `changes_summary`: local changes compared to a base.
- `find_tools`: whether discovery can find the intended capability.
- `list_tools`: whether it is registered, under which source/category, and what schema it exposes.
- `gateway_debug`: registry stats, logs, skipped MCP servers, and recent calls.
- `tool_history` or `/debug/calls`: recent tool executions.

Useful HTTP endpoints:

- `GET /health`
- `GET /debug`
- `GET /debug/logs?limit=200`
- `GET /debug/calls`
- `GET /debug/calls/:id`
- `GET /tools`
- `POST /tools/:toolName`
- `GET /pipelines`
- `GET /pipelines/runs/:runId`

## Dispatch Path

`execute_tool` dispatches in this order:

1. Meta-tool names: `find_tools`, `list_tools`, `gateway_debug`, `batch_tools`, skill helpers, and `gateway_readme`.
2. Composio meta-tools from `getComposioMetaTools()`.
3. `mcp:*` through `McpRunner`.
4. `pipeline:*` through `PipelineRunner`.
5. `skill:*` through `SkillRunner`.
6. Plain names through `ToolRunner`.

If a capability is not found, check the prefix first. Pipelines, skills, and raw MCP tools require prefixes.

## Load Failures

For tools:

- Directory must contain `manifest.json`.
- Entrypoint must be `index.ts` or `index.py`.
- TypeScript must export a tool definition.
- Python must support `--metadata`.
- Duplicate names are skipped or unregistered/replaced during hot reload depending on path.

For pipelines:

- Directory must contain `manifest.json`.
- Entrypoint must be `index.ts` or `index.py`.
- TypeScript must export `default` or `pipeline`.
- Python must support `--metadata`.
- Pipeline registry requires name, description, and handler.

For skills:

- Directory must contain `SKILL.md`.
- Frontmatter must include `description`.
- Name must match the skill slug rules.
- Optional resources are loaded only when requested and must stay inside the skill directory.

For MCP:

- Manifest must have `name`, `description`, and `allowedPaths`.
- `http`/`sse` transports require `url`.
- Missing `requiredEnv` skips the server.
- `package.json` triggers `bun install`.
- Startup/list-tools timeouts can fail slow first-run servers.
- `exposeTools: false` hides raw tools from discovery.

## Hot Reload Problems

If edits do not appear:

1. Confirm the source root is watched or polling applies.
2. Confirm you did not edit `.gateway-reload-cache`.
3. Confirm fingerprinted files changed.
4. Confirm the watcher can watch the source root.
5. Confirm hooks did not reject the candidate.
6. Confirm the old name was unregistered if the manifest name changed.
7. Restart the gateway if watcher setup failed.

Look for log messages like `Hot swapped`, `Hot removed`, `Failed to load`, `Skipping already registered`, `Load candidate failed hooks`, or MCP skipped reasons.

## Runtime Failures

For argument errors, inspect the returned error details. HTTP `/tools/:toolName` builds error details with the effective wrapped tool, source, provided args, description, and input schema.

For async work, do not assume failure from silence. Use `tool_result`, `tool_watch`, `/debug/calls`, or `/pipelines/runs/:runId`.

For MCP multimodal or content formatting issues, inspect both `content` and `structuredContent`. `execute_tool` intentionally promotes native MCP image/resource blocks to top-level `content`.

## Modifying Gateway Code Safely

1. Check `git status --short`.
2. Read the files you will touch and nearby code paths.
3. Preserve unrelated user changes.
4. Make small patches.
5. Run the narrowest useful check: typecheck/test/smoke route/tool call.
6. Check logs or discovery output after reload.
7. Report exactly what was verified and what was not.
