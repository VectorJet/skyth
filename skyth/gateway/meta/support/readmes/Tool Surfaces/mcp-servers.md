# MCP Servers

MCP servers are external tool providers connected through the gateway. The MCP registry scans manifest directories, launches servers, lists server tools, and exposes raw tools as `mcp:<server>_<tool>` unless direct exposure is disabled.

## Directory Shape

```text
<MCP>/<server_name>/
  manifest.json
  .env              optional; local env for this server
  package.json      optional; triggers bun install before launch
```

Use workspace `MCP` for user-added servers. Use `src/builtin/mcp` only for gateway-owned integrations.

## Manifest Requirements

The scanner requires:

- `name`: string.
- `description`: string.
- `allowedPaths`: array.
- `transport`: optional, defaults to `stdio`; valid values are `stdio`, `http`, and `sse`.
- `url`: required and non-empty for `http` or `sse`.

Stdio example:

```json
{
  "name": "filesystem",
  "description": "Sandboxed filesystem MCP server.",
  "allowedPaths": ["${CLAUDE_GATEWAY_FILESYSTEM_ROOT}"],
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem"],
  "appendAllowedPaths": true
}
```

HTTP example:

```json
{
  "name": "remote_service",
  "description": "Remote MCP server.",
  "allowedPaths": [],
  "transport": "http",
  "url": "https://example.com/mcp",
  "headers": {
    "authorization": "Bearer ${REMOTE_SERVICE_TOKEN}"
  },
  "requiredEnv": ["REMOTE_SERVICE_TOKEN"]
}
```

## Environment Handling

The scanner merges process environment, sibling `.env`, and manifest `env`. It substitutes `${ENV_VAR}` tokens in `allowedPaths`, `args`, `url`, `headers`, and `env` values.

If `requiredEnv` is present and any required value is missing after the merge, the server is skipped. Skipped reasons are available through registry/debug output.

Do not hard-code secrets in manifests. Use environment variables or a local uncommitted `.env` beside the MCP manifest.

## Launch Behavior

If the server directory has `package.json`, the launcher runs `bun install` before launch.

For `http`, the launcher uses `StreamableHTTPClientTransport` with manifest headers. For `sse`, it uses `SSEClientTransport` with headers for event source and request init. For `stdio`, it uses `StdioClientTransport`.

For stdio:

- If `command` is set, the launcher uses it with `args`.
- `allowedPaths` are appended only when `appendAllowedPaths` is true.
- If `command` is absent, the launcher runs `bunx mcp-server-<name>`.
- Process env is merged with manifest env.
- `cwd` is the server directory.

Startup has timeouts. `startupTimeoutMs` controls connect and list-tools timeouts; defaults are 30000 ms for connect and 15000 ms for list tools.

## Tool Naming and Exposure

Raw MCP tools are exposed as `mcp:<server>_<tool>`. The registry splits on the first underscore when calling a tool, so server names should not rely on underscores for disambiguation.

Set `"exposeTools": false` when a server should be a private backend transport. Composio uses this pattern and is accessed through gateway-native `composio_*` tools.

## Reload and Debugging

When `autoReload` is enabled, the MCP registry watches manifest changes and calls `reloadServer(serverName)`. Reload stops the current client, rescans manifests, and launches the changed server.

If an MCP tool is missing:

1. Confirm the manifest directory is under a scanned MCP root.
2. Confirm `manifest.json` is valid and has required fields.
3. Confirm required environment variables exist.
4. Confirm the transport and URL/command are correct.
5. Confirm `exposeTools` is not false unless intentional.
6. Inspect `gateway_debug`, `/debug`, and `/debug/logs`.
7. Call `list_tools` with `source: "mcp"`.
8. Execute with `execute_tool` and `tool: "mcp:<server>_<tool>"`.
