# Making Tools

A gateway tool is a callable action with a directory, `manifest.json`, implementation entrypoint, parameter list, handler, and discovery metadata.

## Directory Shape

TypeScript:

```text
<TOOLS>/<tool_name>/
  manifest.json
  index.ts
  package.json        optional; triggers bun install before load
```

Python:

```text
<TOOLS>/<tool_name>/
  manifest.json
  index.py
  requirements.txt    optional; used with uv run --with-requirements when uv is available
```

Use workspace `TOOLS` for durable user tools and `TEMP/tools` for temporary generated tools. Use `src/builtin/tools` only when changing gateway-owned behavior.

## Manifest

The loader only scans directories that contain `manifest.json`. Hooks expect at least `name` and `description`; include `kind: "tool"` when possible. Local/generated tools must declare permissions for risky APIs.

```json
{
  "name": "short_tool_name",
  "description": "Does one focused operation.",
  "kind": "tool",
  "version": "1.0.0",
  "author": "workspace",
  "category": "utility",
  "tags": ["example"],
  "permissions": ["fs:workspace"],
  "ax": {
    "summary": "One-line routing summary.",
    "category": "utility",
    "visibility": "discoverable",
    "triggerPhrases": ["do the focused operation"],
    "whenNotToUse": ["multi-step workflows"]
  }
}
```

Valid permission prefixes are `fs`, `env`, `network`, and `process`, optionally scoped like `fs:workspace` or `env:API_TOKEN`.

## TypeScript Entrypoint

`ToolLoader` imports `index.ts` from a reload-cache copy. It looks for an export whose name contains `tool` or equals the manifest name, otherwise it falls back to `default`. The selected value must have a callable `handler`.

```ts
import type { ToolDefinition } from '@/registries/tools/types.ts';

const tool: ToolDefinition = {
  name: 'short_tool_name',
  description: 'Does one focused operation.',
  parameters: [
    { name: 'input', description: 'Input text.', type: 'string', required: true }
  ],
  handler: async (args) => {
    return { result: String(args.input).trim() };
  },
  metadata: {
    category: 'utility',
    tags: ['example'],
    ax: {
      summary: 'Trim input text.',
      visibility: 'discoverable',
      triggerPhrases: ['trim input text'],
      whenNotToUse: ['large batch file rewrites']
    }
  }
};

export default tool;
```

Supported parameter types are `string`, `number`, `boolean`, `object`, and `array`. The registry validates required parameters and simple runtime types.

## Python Entrypoint

Python tools must support `--metadata`. The loader runs the script with `--metadata`, parses JSON, then wraps the script as a `ToolDefinition`. At execution time it passes one JSON argument string to the script and parses stdout as JSON when possible.

Use `SYSTEM_PYTHON` to choose the interpreter. If `uv` is available, the loader uses `uv run --no-project` and adds `--with-requirements requirements.txt` when present.

The smoke hook rejects Python entrypoints that do not contain `--metadata`.

## Hook Requirements

For local/generated tools, check:

- `manifest.json` exists and is readable JSON.
- Manifest has string `name` and `description`.
- Manifest `kind`, if present, is `tool`.
- Name starts with alphanumeric and uses only alphanumeric, `.`, `_`, `:`, or `-`.
- `index.ts` or `index.py` exists and is non-empty.
- TypeScript source contains an export; Python source supports `--metadata`.
- Files stay inside the source root.
- Permissions match code usage.
- Dynamic code loading is absent.
- AX metadata, if present, has valid field types.

The security hook scans `.ts`, `.js`, `.mjs`, `.cjs`, and `.py` files. It flags filesystem, env, network, process, and dynamic-code patterns for local/generated tools.

## Verification

After creating or editing a tool:

1. Wait for hot reload or restart the gateway.
2. Call `gateway_debug` or inspect `/debug/logs` for load failures.
3. Call `find_tools` with the intended user phrase.
4. Call `list_tools` with `detail: "full"` if you need exact schema confirmation.
5. Execute a tiny smoke input through `execute_tool`.
6. If the tool is builtin-style TypeScript, run `tool_lint` where applicable.

Do not claim a tool is available because files exist on disk. It is available only after the loader, hooks, and registry accept it.
