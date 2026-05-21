import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { getGatewayLogs } from "@/gateway/server/log-buffer.ts";

export const gatewayDebugTool: ToolDefinition = {
	name: "gateway_debug",
	description: `Inspect recent gateway logs and runtime diagnostics.

Use this when the gateway itself is misbehaving: failed tool calls, hot reload issues, route errors, MCP reloads, or confusing output envelopes. Filter with level/query to keep results compact.`,
	parameters: [
		{
			name: "level",
			description:
				"Optional log level filter: log, info, warn, error, or debug",
			type: "string",
			required: false,
			enum: ["log", "info", "warn", "error", "debug"],
		},
		{
			name: "query",
			description:
				"Optional case-insensitive substring filter over log messages",
			type: "string",
			required: false,
		},
		{
			name: "limit",
			description:
				"Maximum number of recent entries to return. Defaults to 100, max 500.",
			type: "number",
			required: false,
		},
	],
	handler: async (args) => {
		const logs = getGatewayLogs({
			level: args.level == null ? undefined : String(args.level),
			query: args.query == null ? undefined : String(args.query),
			limit: Number(args.limit ?? 100),
		});
		return {
			count: logs.length,
			logs,
		};
	},
	metadata: {
		category: "debug",
		tags: ["gateway", "debug", "logs", "runtime"],
		visibility: "discoverable",
		version: "1.0.0",
		author: "system",
	},
};
