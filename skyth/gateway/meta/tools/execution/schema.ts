export const executeToolDescription = `Execute a gateway tool by exact name with the provided arguments.

Use find_tools first when you are unsure which tool fits the task. execute_tool is the execution path once the tool name is known.

Supported names:
- Built-in tools: "read", "grep", "apply_patch", "bash", etc.
- Pipelines: "pipeline:<name>"
- Skills: "skill:<name>"
- MCP tools: "mcp:<server_tool>"
- Selected meta-tools: "gateway_readme", "find_tools", "list_tools", "batch_tools", "list_skills", "create_skill", "use_skill"
- Composio meta-tools: "composio_search_tools", "composio_manage_connections", "composio_get_tool_schemas", "composio_multi_execute_tool", etc.

Async UX:
- Set async=true for long-running work to get a runId immediately.
- Prefer wait({ runId }) and end the response when the run may take a while; the gateway will notify on completion.
- Use tool_result({ runId }) to check manually without waiting.
- Use tool_watch({ runId }) only for short waits where the result is needed before responding.
- If a synchronous run exceeds the gateway grace period, execute_tool may auto-return a runId and continue in the background.

Examples:
- execute_tool({ tool: "read", args: { filePath: "/path/to/file" } })
- execute_tool({ tool: "apply_patch", args: { patchText: "...", dryRun: true } })
- execute_tool({ tool: "pipeline:transcript", args: { url: "https://youtube.com/..." }, async: true })
- execute_tool({ tool: "skill:skill-name", args: { task: "current user task" } })
- execute_tool({ tool: "mcp:context7_resolve-library-id", args: { libraryName: "React" } })`;

import type { ToolParameter } from "@/gateway/registries/tools/types.ts";

export const executeToolParameters: ToolParameter[] = [
	{
		name: "tool",
		description:
			'Exact tool name. Use "pipeline:name" for pipelines, "skill:name" for skills, and "mcp:server_tool" for MCP tools. Use find_tools first if unsure.',
		type: "string",
		required: true,
	},
	{
		name: "args",
		description: "Arguments to pass to the tool",
		type: "object",
		required: false,
	},
	{
		name: "async",
		description:
			"If true, execute in the background and return runId immediately. Prefer wait(runId) after starting long-running work.",
		type: "boolean",
		required: false,
	},
];
