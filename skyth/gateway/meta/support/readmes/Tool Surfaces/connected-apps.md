# Connected Apps and Composio

Composio is connected as a backend MCP transport, but normal agents should use gateway-native `composio_*` meta-tools. The raw MCP server can be hidden with `exposeTools: false`, which means raw `mcp:composio_*` calls may not appear in discovery.

## Workflow

1. Use `composio_search_tools` for an external app workflow. Provide the actual use case and request a session id.
2. Reuse the returned `session.id` in every follow-up Composio call.
3. If a result says an app is not connected, use `composio_manage_connections`.
4. Wait for OAuth or connection completion with `composio_wait_for_connections`.
5. If a tool result has `schemaRef`, call `composio_get_tool_schemas`.
6. Execute actions with `composio_multi_execute_tool` using the exact `tool_slug` and schema-compliant arguments.

## Rules

- Do not guess app schemas.
- Treat connection state as dynamic.
- Keep session ids tied to the workflow.
- Do not expose or store app secrets in generated code or docs.
- Inspect returned schema, connection state, and error payload before retrying failed app actions.

## When Not to Use Composio

Use direct gateway tools for local files, shell commands, git, gateway source edits, memory, pipelines, skills, and gateway debugging. Use Composio for external SaaS/app actions where Composio provides the integration.
