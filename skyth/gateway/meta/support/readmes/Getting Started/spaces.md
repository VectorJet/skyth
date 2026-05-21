# Workspace Space vs User Space

Gateway agents must keep three spaces distinct: builtin gateway source, workspace capability space, and the user’s broader machine.

## Builtin Gateway Source

Builtin source is the gateway repository itself. Important roots include:

- `src/meta/tools`: model-facing control plane, including `gateway_readme`, discovery, execution, async run helpers, and debug tools.
- `src/meta/support/readmes`: hot-reloadable documentation used by `gateway_readme`.
- `src/builtin/tools`: gateway-owned tools.
- `src/builtin/pipelines`: gateway-owned pipelines.
- `src/builtin/skills`: gateway-owned skills.
- `src/builtin/mcp`: gateway-owned MCP server manifests.
- `src/hooks`, `src/loaders`, `src/registries`, `src/runners`, `src/watchers`, `src/server`, and `src/api`: gateway internals.

Modify builtin source only when the user asks to change gateway behavior or documentation shipped with the gateway. Builtin sources are marked `trusted` and `writable: false` in the source layout. They still deserve the same manifest and hook discipline, but the security permission hook skips strict scans for trusted source.

## Workspace Capability Space

Workspace space is controlled by `CLAUDE_GATEWAY_WORKSPACE`. If it is not set, the default is `~/.claude-gateway/workspaces/default`.

The workspace roots are:

- `TOOLS`: user-created durable tools.
- `PIPELINES`: user-created durable pipelines.
- `SKILLS`: user-created durable skills.
- `MCP`: user-created MCP server manifests.
- `AGENTS`: user-created agent definitions.

These sources are writable, hot reloadable, and use trust level `local`. Local sources are checked by source policy, manifest/schema hooks, AX metadata validation, permissions scanning, and smoke tests when hooks are enforced.

## Temporary Capability Space

Temporary space lives under the workspace root:

- `TEMP/tools`
- `TEMP/pipelines`
- `TEMP/skills`
- `TEMP/mcp`
- `TEMP/agents`

Temporary sources are writable and use trust level `generated`. Use them for throwaway helpers, experiments, and generated capabilities that should not become permanent yet. The local/generated policy expects temporary/generated sources to use generated trust.

## User Space

User space is everything else on the machine: home directory, project repositories, downloads, secrets, shell environment, application data, and arbitrary filesystem paths. Treat it as user-owned data, not gateway-owned capability source.

Rules:

- Do not write outside the requested project or capability workspace unless the user explicitly asks for that path.
- Do not store secrets in committed source. Use environment variables or a local MCP `.env` when appropriate.
- Put reusable user capabilities in workspace roots, not builtin source.
- Use temporary roots for generated experiments that may be discarded.
- Edit the repo only when the task is to modify the gateway itself or another explicit codebase.

## Placement Decisions

- Gateway behavior or meta-tool change: `src/meta/tools` or relevant gateway internals.
- Gateway documentation for agents: `src/meta/support/readmes/<category>`.
- Gateway-owned built-in capability: `src/builtin/<kind>`.
- User-specific durable tool: workspace `TOOLS/<name>`.
- User-specific durable pipeline: workspace `PIPELINES/<name>`.
- User instruction bundle: workspace `SKILLS/<name>/SKILL.md`.
- User MCP server: workspace `MCP/<server>/manifest.json`.
- Throwaway helper: workspace `TEMP/<kind>/<name>`.

Never edit `.gateway-reload-cache` as source. It is generated from real source directories.
