import type { MetaToolsManager } from "@/gateway/meta/tools/index.ts";

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

export function buildToolErrorDetails(
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
