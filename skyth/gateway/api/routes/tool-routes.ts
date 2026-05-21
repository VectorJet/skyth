import type { Hono } from "hono";
import type { MetaToolsManager } from "@/gateway/meta/tools/index.ts";
import type { SSEManager } from "@/gateway/mcp/sse-manager";
import { pruneGatewayOutputObject } from "@/gateway/utils/prune-output.ts";
import {
	fmtToolInvocation,
	fmtToolFailure,
} from "@/gateway/utils/log-format.ts";
import {
	recordToolCallStart,
	finishToolCall,
} from "@/gateway/server/tool-call-buffer.ts";

function toInputSchema(tool: any): any {
	if (tool?.inputSchema) return tool.inputSchema;
	const schema: any = { type: "object", properties: {}, required: [] };
	for (const param of tool?.parameters || []) {
		schema.properties[param.name] = {
			type: param.type,
			description: param.description,
		};
		if (param.enum) schema.properties[param.name].enum = param.enum;
		if (param.properties)
			schema.properties[param.name].properties = param.properties;
		if (param.items) schema.properties[param.name].items = param.items;
		if (param.required) schema.required.push(param.name);
	}
	return schema;
}

function buildToolErrorDetails(
	metaToolsManager: MetaToolsManager,
	toolName: string,
	args: Record<string, any>,
	error: any,
) {
	const message = error?.message || String(error) || "Unknown error";
	const { toolRegistry, pipelineRegistry, mcpRegistry, skillRegistry } =
		metaToolsManager.getRegistries();
	const wrappedToolName =
		toolName === "execute_tool" && typeof args?.tool === "string"
			? args.tool
			: undefined;
	const effectiveName = wrappedToolName || toolName;
	const effectiveArgs =
		wrappedToolName && args && typeof args === "object" && "args" in args
			? args.args
			: args;

	let schema: any = metaToolsManager
		.getMetaTools()
		.get(effectiveName)?.inputSchema;
	let description =
		metaToolsManager.getMetaTools().get(effectiveName)?.description || "";
	let source = "meta";

	if (wrappedToolName?.startsWith("mcp:")) {
		const mcpName = wrappedToolName.slice("mcp:".length);
		const mcpTool = mcpRegistry.getAllTools().get(mcpName)?.tool;
		schema = mcpTool?.inputSchema || mcpTool?.schema || schema;
		description = mcpTool?.description || description;
		source = "mcp";
	} else if (wrappedToolName?.startsWith("pipeline:")) {
		const pipelineName = wrappedToolName.slice("pipeline:".length);
		const pipeline = pipelineRegistry.getPipeline(pipelineName)?.definition;
		schema = toInputSchema(pipeline);
		description = pipeline?.description || description;
		source = "pipeline";
	} else if (wrappedToolName?.startsWith("skill:")) {
		const skillName = wrappedToolName.slice("skill:".length);
		const skill = skillRegistry.getSkill(skillName)?.definition;
		schema = {
			type: "object",
			properties: {
				task: {
					type: "string",
					description: "Task to perform with this skill",
				},
			},
			required: [],
		};
		description = skill?.description || description;
		source = "skill";
	} else {
		const internal = toolRegistry.getTool(effectiveName)?.definition;
		if (internal) {
			schema = toInputSchema(internal);
			description = internal.description || description;
			source = toolRegistry.getTool(effectiveName)?.source || "tool";
		}
	}

	const missingMatch = /Required parameter "([^"]+)" is missing/.exec(message);
	const hint = missingMatch
		? `Provide the "${missingMatch[1]}" argument and retry "${effectiveName}".`
		: `Review the input schema and retry "${effectiveName}" with corrected arguments.`;

	return {
		message,
		effectiveTool: effectiveName,
		source,
		providedArgs: effectiveArgs ?? {},
		hint,
		description,
		inputSchema: schema || { type: "object", properties: {} },
	};
}

export function registerToolRoutes(
	app: Hono,
	metaToolsManager: MetaToolsManager,
	sseManager: SSEManager,
	disabledTools: Set<string>,
	getAllTools: () => Map<string, any>,
	callTool: (toolName: string, args: Record<string, any>) => Promise<any>,
) {
	// List all available tools
	app.get("/tools", (c) => {
		const tools = getAllTools();
		const toolsList = Array.from(tools.values());

		return c.json({
			count: toolsList.length,
			tools: toolsList,
		});
	});

	// Execute a tool
	app.post("/tools/:toolName", async (c) => {
		const toolName = c.req.param("toolName");
		let args: Record<string, any> = {};

		try {
			const body = await c.req.json();
			if (body && typeof body === "object" && "arguments" in body) {
				args = body.arguments || {};
			} else if (
				toolName === "execute_tool" &&
				body &&
				typeof body === "object" &&
				("tool" in body || "async" in body)
			) {
				args = body;
			} else if (body && typeof body === "object" && "args" in body) {
				args = body.args || {};
			} else {
				args = body || {};
			}

			const innerFn =
				toolName === "execute_tool" && typeof args?.tool === "string"
					? args.tool
					: undefined;
			const innerArgs =
				innerFn && args && typeof args === "object" && "args" in args
					? (args as any).args
					: args;
			const rec = recordToolCallStart({
				tool: toolName,
				function: innerFn,
				args,
				source: "http",
			});
			console.log(
				fmtToolInvocation({
					tool: toolName,
					function: innerFn,
					args: innerArgs ?? args,
					callId: rec.id,
				}),
			);

			const start = Date.now();
			try {
				const result = pruneGatewayOutputObject(await callTool(toolName, args));
				finishToolCall(rec, {
					status: "ok",
					result,
					durationMs: Date.now() - start,
				});
				return c.json({
					tool: toolName,
					result,
				});
			} catch (error: any) {
				const details = buildToolErrorDetails(
					metaToolsManager,
					toolName,
					args,
					error,
				);
				finishToolCall(rec, {
					status: "error",
					error: details.message,
					durationMs: Date.now() - start,
				});
				console.warn(
					fmtToolFailure({
						tool: toolName,
						function: innerFn,
						callId: rec.id,
						message: details.message,
						durationMs: Date.now() - start,
					}),
				);
				return c.json(
					{
						success: false,
						tool: toolName,
						error: details.message,
						details,
						callId: rec.id,
					},
					500,
				);
			}
		} catch (parseError: any) {
			return c.json(
				{
					success: false,
					tool: toolName,
					error: parseError?.message || "Invalid request",
				},
				400,
			);
		}
	});

	// Endpoint to disable a tool
	app.post("/tools/disable", async (c) => {
		try {
			const body = await c.req.json();
			const toolName = body.toolName;
			if (toolName) {
				const { toolRegistry } = metaToolsManager.getRegistries();

				// Check if it's an internal tool
				if (toolRegistry.hasTool(toolName)) {
					disabledTools.add(toolName);
					console.log(`[Gateway] Disabled internal tool: ${toolName}`);
				} else {
					// Could be a meta-tool
					disabledTools.add(toolName);
					console.log(`[Gateway] Disabled tool: ${toolName}`);
				}

				sseManager.notifyToolsListChanged();
				return c.json({
					success: true,
					disabledTools: Array.from(disabledTools),
				});
			}
			return c.json({ success: false, error: "Missing toolName" }, 400);
		} catch (e: any) {
			return c.json({ success: false, error: e.message }, 400);
		}
	});

	// Endpoint to enable a tool
	app.post("/tools/enable", async (c) => {
		try {
			const body = await c.req.json();
			const toolName = body.toolName;
			if (toolName) {
				disabledTools.delete(toolName);
				console.log(`[Gateway] Enabled tool: ${toolName}`);
				sseManager.notifyToolsListChanged();
				return c.json({
					success: true,
					disabledTools: Array.from(disabledTools),
				});
			}
			return c.json({ success: false, error: "Missing toolName" }, 400);
		} catch (e: any) {
			return c.json({ success: false, error: e.message }, 400);
		}
	});

	// Endpoint to add a new test tool dynamically
	app.post("/tools/add-test", async (c) => {
		try {
			const { toolRegistry } = metaToolsManager.getRegistries();

			const testTool = {
				name: "test_dynamic_tool",
				description:
					"A dynamically added test tool that returns the current timestamp",
				parameters: [
					{
						name: "message",
						type: "string" as const,
						description: "Optional message to include in response",
						required: false,
					},
				],
				handler: async (args: any) => {
					const timestamp = new Date().toISOString();
					const message = args.message || "No message provided";
					return `[DYNAMIC TOOL] Called at ${timestamp}. Message: ${message}`;
				},
			};

			toolRegistry.register(testTool, "custom");

			console.log("[Gateway] Added test_dynamic_tool");
			sseManager.notifyToolsListChanged();

			return c.json({ success: true, toolName: "test_dynamic_tool" });
		} catch (e: any) {
			return c.json({ success: false, error: e.message }, 400);
		}
	});

	// Register a custom tool
	app.post("/tools", async (c) => {
		try {
			const body = await c.req.json();
			const { name, description, parameters, handler, metadata } = body;

			// Validate required fields
			if (!name || !description || !parameters) {
				return c.json(
					{
						success: false,
						error: "Missing required fields: name, description, parameters",
					},
					400,
				);
			}

			// Handler must be provided as a string that can be evaluated
			if (!handler || typeof handler !== "string") {
				return c.json(
					{
						success: false,
						error: "Handler must be provided as a string function",
					},
					400,
				);
			}

			// Create the handler function from string
			const handlerFn = new Function("args", `return (${handler})(args)`) as (
				args: Record<string, any>,
			) => Promise<any>;

			const { toolRegistry } = metaToolsManager.getRegistries();

			// Register the tool
			toolRegistry.register(
				{
					name,
					description,
					parameters,
					handler: handlerFn,
					metadata,
				},
				"custom",
			);

			return c.json({
				success: true,
				message: `Tool "${name}" registered successfully`,
				tool: { name, description, parameters, metadata },
			});
		} catch (error: any) {
			console.error("Error registering tool:", error);
			return c.json(
				{
					success: false,
					error: error.message || "Failed to register tool",
				},
				500,
			);
		}
	});

	// Unregister a custom tool
	app.delete("/tools/:toolName", (c) => {
		const toolName = c.req.param("toolName");

		const { toolRegistry } = metaToolsManager.getRegistries();

		// Check if it's a custom tool
		const tool = toolRegistry.getTool(toolName);
		if (!tool) {
			return c.json(
				{
					success: false,
					error: `Custom tool "${toolName}" not found`,
				},
				404,
			);
		}

		// Only allow deleting custom tools
		if (tool.source !== "custom") {
			return c.json(
				{
					success: false,
					error: `Cannot delete ${tool.source} tool "${toolName}"`,
				},
				403,
			);
		}

		const deleted = toolRegistry.unregister(toolName);

		return c.json({
			success: deleted,
			message: deleted
				? `Tool "${toolName}" unregistered`
				: `Failed to unregister tool "${toolName}"`,
		});
	});
}
