# Registries and Hot Reload

The gateway discovers capabilities from source roots, registers them in memory, and hot reloads source changes while the process is running.

## Registries

The main registries are:

- Tool registry: stores `ToolDefinition` objects. Sources are `builtin`, `custom`, `mcp`, or `pipeline`. It validates name, description, parameters, handler, required arguments, and simple parameter types.
- Pipeline registry: stores pipeline definitions and async run records. `execute` creates a `runId`, marks a run pending/running/completed/failed, and stores output or error.
- Skill registry: stores loaded `SKILL.md` bundles. Workspace skills can shadow earlier sources because later scanned sources overwrite earlier names.
- MCP registry: scans MCP manifests, launches servers, stores running clients, lists server tools, and calls raw MCP tools.

## Initial Runtime Load

`MetaToolsManager.initialize()` loads meta-tool modules first, then calls `RuntimeLoader.loadRuntimeCapabilities()`. The runtime loader loads tools and pipelines from builtin, workspace, and temporary sources. Skills and MCP servers are initialized elsewhere through their own registries/loaders, but discovery and execution see all four surfaces.

The manager then registers legacy pipeline tools for backwards compatibility and wires registries into meta-tools such as `find_tools`, `list_tools`, and `execute_tool`.

## Hot Reload Paths

There are several reload paths:

- Runtime watchers: `WatcherManager` watches source roots and emits debounced `reload.requested` events. `MetaToolsManager.attachWatcher()` reloads the changed tool/pipeline source, reloads skills, or calls `mcpRegistry.reloadServer(name)`.
- Builtin tool polling: `startToolHotReload()` fingerprints `src/builtin/tools` every `CLAUDE_GATEWAY_TOOL_RELOAD_MS` milliseconds, default 1000.
- Meta-tool polling: `startMetaHotReload()` fingerprints `src/meta/tools` every `CLAUDE_GATEWAY_META_RELOAD_MS` milliseconds, default 1000.
- MCP manifest watching: `MCPRegistry` watches manifest changes when `autoReload` is enabled and reloads the named server.
- Readme reload: `gateway_readme` reads `src/meta/support/readmes/**/*.md` on every call. Documentation changes do not require TypeScript reload.

## Fingerprints and Reload Cache

Tool, pipeline, and meta-tool hot reload relies on directory fingerprints. Fingerprinting considers `.ts`, `.js`, `.json`, `.py`, `.toml`, and `.txt` files in meta-tool code; runtime capability directories are copied before import.

TypeScript tools and pipelines are copied into `.gateway-reload-cache/tools` or `.gateway-reload-cache/pipelines` and imported from the copied path. Local `node_modules` is symlinked into the cache when present. This avoids stale module imports after source edits.

If a change appears ignored:

1. Confirm you edited the source directory, not `.gateway-reload-cache`.
2. Confirm the capability directory contains `manifest.json`.
3. Confirm the entrypoint is `index.ts` or `index.py`.
4. Confirm hooks did not reject it.
5. Check `gateway_debug`, `/debug/logs`, or process logs for load errors.
6. Restart the gateway if the file watcher failed to attach to the source root.

## Deletion and Replacement

Hot reload tracks loaded tool and pipeline directories. If a previously loaded directory disappears, the manager unregisters the old tool or pipeline. If a changed directory loads to a new manifest name, the manager unregisters the previous name and tracks the new one.

The tool registry normally disallows duplicate names unless configured otherwise. Hot reload explicitly unregisters conflicting names for changed sources before registering the replacement.
