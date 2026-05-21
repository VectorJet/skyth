# Hooks and Validation

Hooks run against load candidates before registration. They are the gateway’s load-time safety and quality checks for tools, pipelines, skills, MCP servers, and agents.

## Hook Manager

`HookManager` stores hooks and runs only hooks whose `appliesTo` includes the candidate kind. Hooks are sorted by phase:

1. `preload`
2. `validate`
3. `security`
4. `policy`
5. `test`
6. `register`
7. `postload`

Each hook returns `ok`, `hook`, `phase`, `severity`, and an optional message/details. A failed hook with severity `error` makes the run report not ok. If the hook manager is constructed with `enforce: true`, any error-severity failure throws and the candidate is rejected.

## Current Hooks

- `preload.manifest-exists`: for tools, pipelines, MCP, and agents. Requires a manifest path and a real `manifest.json` file.
- `standards.basic`: validates capability names, roots, readable JSON manifests, string `name` and `description`, and entrypoint existence.
- `manifest.schema`: validates manifest JSON, string `name`/`description`, matching `kind`, and permission string format.
- `ax.metadata`: validates AX metadata from manifest `ax` or sidecars `AX.json`, `ax.json`, `.gateway-ax.json`.
- `security.source-policy`: ensures candidate roots and files stay inside the load source and builtin sources are not writable.
- `security.permissions`: scans local/generated tool, pipeline, MCP, and agent source for undeclared filesystem, env, network, process, or dynamic-code usage.
- `policy.local-generated`: ensures temporary/generated sources use generated trust.
- `tests.smoke`: checks non-empty entrypoints, TypeScript/JavaScript exports, and Python `--metadata` support.
- `audit.load`: reports candidate kind/source/name after load checks.

## Permission Scanner

The security permission hook is skipped for trusted builtin source. For local/generated source it scans `.ts`, `.js`, `.mjs`, `.cjs`, and `.py` files.

Declare permissions when source contains:

- `process.env`, `os.environ`, or `Deno.env`: `env` or `env:<NAME>`.
- `fetch`, `WebSocket`, `EventSource`, or URL literals: `network`.
- `child_process`, `spawn`, `execFile`, `execSync`, `subprocess`, or `os.system`: `process` or `process:<scope>`.
- `fs`, `fs/promises`, `Bun.file`, `open(`, or `Path(`: `fs` or `fs:<scope>`.

Dynamic code loading is not allowed for local/generated capabilities: `eval`, `Function(`, `vm.runIn`, Python `__import__(`, and `importlib` are rejected.

## AX Metadata Shape

AX metadata is optional but important for discovery. Valid fields:

- `summary`: string.
- `category`: string.
- `visibility`: `always`, `suggested`, `discoverable`, `hidden`, or `blocked`.
- `triggerPhrases`: string array.
- `relatedTools`: string array.
- `whenNotToUse`: string array.
- `commonUses`: string array.
- `followUps`: string array.
- `intentExamples`: string array.

Invalid AX field types reject the candidate when hooks are enforced.

## Checking Work Against Hooks

Before saying a capability is done:

1. Read or create the candidate directory under the correct source root.
2. Confirm `manifest.json` exists for manifest-backed kinds.
3. Confirm manifest `name`, `description`, and `kind`.
4. Confirm entrypoint exists and exports a definition or supports `--metadata`.
5. Confirm permissions match code patterns.
6. Confirm AX metadata is valid and specific.
7. Wait for hot reload or restart the gateway.
8. Inspect `gateway_debug` or `/debug/logs` for hook/load failures.
9. Confirm registration through `find_tools` or `list_tools`.
10. Execute a minimal smoke call.

Files on disk are not enough. The registry is the source of truth after hooks and loaders run.
