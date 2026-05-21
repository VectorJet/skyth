import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import type {
	ToolDefinition,
	ToolParameter,
} from "@/gateway/registries/tools/types.ts";
import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";

const SEARCH_TOOL = "composio_COMPOSIO_SEARCH_TOOLS";
const EXECUTE_TOOL = "composio_COMPOSIO_MULTI_EXECUTE_TOOL";

function extractText(result: any): string {
	if (!Array.isArray(result?.content)) return "";
	return result.content
		.filter(
			(item: any) => item?.type === "text" && typeof item.text === "string",
		)
		.map((item: any) => item.text)
		.join("\n");
}

function parseJsonText(result: any): any {
	const text = extractText(result);
	if (!text) return result;
	try {
		return JSON.parse(text);
	} catch {
		return { text };
	}
}

function sanitizeName(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 96);
}

function schemaTypeToToolType(type: any): ToolParameter["type"] {
	if (type === "number" || type === "integer") return "number";
	if (type === "boolean") return "boolean";
	if (type === "array") return "array";
	if (type === "object") return "object";
	return "string";
}

function parameterFromSchema(
	name: string,
	schema: any,
	required: boolean,
): ToolParameter {
	const type = Array.isArray(schema?.type)
		? schema.type.find((item: string) => item !== "null")
		: schema?.type;
	const parameter: ToolParameter = {
		name,
		description: schema?.description || schema?.title || "",
		type: schemaTypeToToolType(
			type ||
				(schema?.properties ? "object" : schema?.items ? "array" : "string"),
		),
		required,
		default: schema?.default,
		enum: Array.isArray(schema?.enum) ? schema.enum : undefined,
	};

	if (parameter.type === "object" && schema?.properties) {
		parameter.properties = Object.fromEntries(
			Object.entries(schema.properties).map(
				([childName, childSchema]: [string, any]) => [
					childName,
					parameterFromSchema(
						childName,
						childSchema,
						schema.required?.includes(childName) || false,
					),
				],
			),
		);
	}

	if (parameter.type === "array" && schema?.items) {
		parameter.items = parameterFromSchema("item", schema.items, false);
	}

	return parameter;
}

function parametersFromInputSchema(schema: any): ToolParameter[] {
	const properties =
		schema?.properties && typeof schema.properties === "object"
			? schema.properties
			: {};
	const required = Array.isArray(schema?.required) ? schema.required : [];
	return Object.entries(properties).map(([name, def]: [string, any]) =>
		parameterFromSchema(name, def, required.includes(name)),
	);
}

function getConfiguredQueries(): string[] {
	const configured = process.env.CLAUDE_GATEWAY_COMPOSIO_DIRECT_QUERIES;
	if (configured) {
		return configured
			.split(/[|,\n]/)
			.map((item) => item.trim())
			.filter(Boolean);
	}

	return [
		"github tools for connected github account",
		"reddit tools for connected reddit account",
	];
}

function shouldRegisterSchema(
	schema: any,
	activeToolkits: Set<string>,
): boolean {
	const toolkit = String(schema?.toolkit || "").toLowerCase();
	if (!toolkit) return true;
	if (activeToolkits.size === 0) return true;
	return activeToolkits.has(toolkit);
}

function buildExecuteArgs(
	executorSchema: any,
	toolSlug: string,
	args: Record<string, any>,
	sessionId?: string,
): Record<string, any> {
	const props = executorSchema?.properties || {};
	if ("tools" in props) {
		return {
			tools: [{ tool_slug: toolSlug, arguments: args }],
			...(sessionId ? { session: { id: sessionId } } : {}),
		};
	}
	if ("executions" in props) {
		return {
			executions: [{ tool_slug: toolSlug, arguments: args }],
			...(sessionId ? { session: { id: sessionId } } : {}),
		};
	}
	if ("tool_slug" in props || "arguments" in props) {
		return {
			tool_slug: toolSlug,
			arguments: args,
			...(sessionId ? { session: { id: sessionId } } : {}),
		};
	}
	return {
		tools: [{ tool_slug: toolSlug, arguments: args }],
		...(sessionId ? { session: { id: sessionId } } : {}),
	};
}

function simplifyExecutionResult(result: any): any {
	const parsed = parseJsonText(result);
	if (
		parsed?.data !== undefined ||
		parsed?.error !== undefined ||
		parsed?.successful !== undefined
	)
		return parsed;
	return parsed;
}

function createDirectTool(
	mcpRegistry: MCPRegistry,
	schema: any,
	sessionId?: string,
): ToolDefinition | null {
	const toolSlug = String(schema?.tool_slug || "").trim();
	const inputSchema = schema?.input_schema;
	if (!toolSlug || !inputSchema?.properties) return null;

	const toolkit = String(
		schema.toolkit || toolSlug.split("_")[0] || "composio",
	).toLowerCase();
	const name = sanitizeName(toolSlug);
	const executorSchema = mcpRegistry
		.getServer("composio")
		?.tools?.get("COMPOSIO_MULTI_EXECUTE_TOOL")?.inputSchema;

	return {
		name,
		description: `${schema.description || `Run Composio tool ${toolSlug}`}\n\nComposio tool slug: ${toolSlug}`,
		parameters: parametersFromInputSchema(inputSchema),
		handler: async (args) => {
			const result = await mcpRegistry.callTool(
				EXECUTE_TOOL,
				buildExecuteArgs(executorSchema, toolSlug, args, sessionId),
			);
			return simplifyExecutionResult(result);
		},
		metadata: {
			category: "integration",
			tags: ["composio", toolkit, toolSlug.toLowerCase()],
			version: "1.0.0",
			author: "composio",
			ax: {
				summary: schema.description || `Run ${toolSlug} through Composio.`,
				category: "integration",
				visibility: "discoverable",
				triggerPhrases: [
					toolSlug.replace(/_/g, " ").toLowerCase(),
					`${toolkit} integration`,
				],
				relatedTools: ["find_tools", "execute_tool"],
				commonUses: [`Run ${toolSlug} for the connected ${toolkit} account.`],
				whenNotToUse: [
					"Use native gateway tools for local files, shell commands, code edits, or browser automation.",
				],
			},
		},
	};
}

export async function registerComposioDirectTools(
	toolRegistry: ToolRegistry,
	mcpRegistry: MCPRegistry,
): Promise<string[]> {
	const composioServer = mcpRegistry.getServer("composio");
	if (!composioServer) return [];
	if (
		!composioServer.tools.has("COMPOSIO_SEARCH_TOOLS") ||
		!composioServer.tools.has("COMPOSIO_MULTI_EXECUTE_TOOL")
	)
		return [];

	const queries = getConfiguredQueries().map((use_case) => ({ use_case }));
	if (queries.length === 0) return [];

	const searchResult = await mcpRegistry.callTool(SEARCH_TOOL, {
		queries,
		session: { generate_id: true },
		model: process.env.CLAUDE_GATEWAY_COMPOSIO_DIRECT_MODEL || "gpt-5.2",
	});
	const parsed = parseJsonText(searchResult);
	const data = parsed?.data || parsed;
	const schemas =
		data?.tool_schemas && typeof data.tool_schemas === "object"
			? data.tool_schemas
			: {};
	const sessionId = data?.session?.id;
	const activeToolkits = new Set<string>(
		(Array.isArray(data?.toolkit_connection_statuses)
			? data.toolkit_connection_statuses
			: []
		)
			.filter((item: any) => item?.has_active_connection === true)
			.map((item: any) => String(item.toolkit || "").toLowerCase())
			.filter(Boolean),
	);

	const registered: string[] = [];
	for (const schema of Object.values(schemas) as any[]) {
		if (schema?.hasFullSchema === false) continue;
		if (!shouldRegisterSchema(schema, activeToolkits)) continue;
		const tool = createDirectTool(mcpRegistry, schema, sessionId);
		if (!tool || toolRegistry.hasTool(tool.name)) continue;
		toolRegistry.register(tool, "mcp");
		registered.push(tool.name);
	}

	if (registered.length > 0) {
		console.log(
			`[Composio] Registered ${registered.length} direct gateway tool(s): ${registered.join(", ")}`,
		);
	} else {
		console.log(
			"[Composio] No direct gateway tools registered from search results",
		);
	}

	return registered;
}
