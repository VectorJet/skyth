import {
	batchToolsTool,
	createSkillTool,
	delegateTool,
	executeComposioMetaTool,
	executeToolTool,
	findToolsTool,
	gatewayDebugTool,
	gatewayReadmeTool,
	getComposioMetaTools,
	listSkillsTool,
	listToolsTool,
	taskTool,
	toolResultTool,
	toolWatchTool,
	useSkillTool,
	waitTool,
} from "@/gateway/meta/tools/index.ts";
import type { MetaToolModules } from "@/gateway/meta/tools/manager/modules.ts";

function convertToInputSchema(tool: any): any {
	const inputSchema: any = { type: "object", properties: {}, required: [] };
	for (const param of tool.parameters) {
		inputSchema.properties[param.name] = {
			type: param.type,
			description: param.description,
		};
		if (param.enum) inputSchema.properties[param.name].enum = param.enum;
		if (param.properties)
			inputSchema.properties[param.name].properties = Object.fromEntries(
				Object.entries(param.properties).map(([name, prop]) => [
					name,
					parameterToInputSchemaProperty(prop as any),
				]),
			);
		if (param.items)
			inputSchema.properties[param.name].items = parameterToInputSchemaProperty(
				param.items,
			);
		if (param.required) inputSchema.required.push(param.name);
	}
	return inputSchema;
}

function parameterToInputSchemaProperty(parameter: any): any {
	const required = Array.isArray(parameter.required)
		? parameter.required
		: undefined;
	return {
		type: parameter.type,
		description: parameter.description,
		...(parameter.enum ? { enum: parameter.enum } : {}),
		...(parameter.properties
			? {
					properties: Object.fromEntries(
						Object.entries(parameter.properties).map(([name, prop]) => [
							name,
							parameterToInputSchemaProperty(prop),
						]),
					),
				}
			: {}),
		...(parameter.items
			? { items: parameterToInputSchemaProperty(parameter.items) }
			: {}),
		...(required ? { required } : {}),
	};
}

export function getMetaToolsForModules(
	modules: MetaToolModules | null,
): Map<string, any> {
	const metaTools = new Map();
	const tools = {
		find_tools: modules?.find.findToolsTool || findToolsTool,
		list_tools: modules?.list.listToolsTool || listToolsTool,
		execute_tool: modules?.execute.executeToolTool || executeToolTool,
		tool_watch: modules?.toolWatch.toolWatchTool || toolWatchTool,
		wait: modules?.wait.waitTool || waitTool,
		tool_result: modules?.toolResult.toolResultTool || toolResultTool,
		batch_tools: modules?.batch.batchToolsTool || batchToolsTool,
		gateway_debug: modules?.debug.gatewayDebugTool || gatewayDebugTool,
		gateway_readme: modules?.readme.gatewayReadmeTool || gatewayReadmeTool,
		list_skills: modules?.listSkills.listSkillsTool || listSkillsTool,
		create_skill: modules?.createSkill.createSkillTool || createSkillTool,
		use_skill: modules?.useSkill.useSkillTool || useSkillTool,
		delegate: modules?.delegate.delegateTool || delegateTool,
		task: modules?.task.taskTool || taskTool,
	};
	for (const [name, tool] of Object.entries(tools)) {
		metaTools.set(name, {
			name,
			description: tool.description,
			inputSchema: convertToInputSchema(tool),
			source: "meta",
		});
	}
	const composioMetaTools =
		modules?.composioMeta.getComposioMetaTools() || getComposioMetaTools();
	for (const [name, tool] of composioMetaTools.entries())
		metaTools.set(name, tool);
	return metaTools;
}

export async function executeMetaToolForModules(
	modules: MetaToolModules | null,
	toolName: string,
	args: Record<string, any>,
	tabContext: Record<string, any>,
): Promise<any> {
	const metaToolHandlers: Record<string, any> = {
		find_tools: (modules?.find.findToolsTool || findToolsTool).handler,
		list_tools: (modules?.list.listToolsTool || listToolsTool).handler,
		execute_tool: (modules?.execute.executeToolTool || executeToolTool).handler,
		tool_watch: (modules?.toolWatch.toolWatchTool || toolWatchTool).handler,
		wait: (modules?.wait.waitTool || waitTool).handler,
		tool_result: (modules?.toolResult.toolResultTool || toolResultTool).handler,
		batch_tools: (modules?.batch.batchToolsTool || batchToolsTool).handler,
		gateway_debug: (modules?.debug.gatewayDebugTool || gatewayDebugTool)
			.handler,
		gateway_readme: (modules?.readme.gatewayReadmeTool || gatewayReadmeTool)
			.handler,
		list_skills: (modules?.listSkills.listSkillsTool || listSkillsTool).handler,
		create_skill: (modules?.createSkill.createSkillTool || createSkillTool)
			.handler,
		use_skill: (modules?.useSkill.useSkillTool || useSkillTool).handler,
		delegate: (modules?.delegate.delegateTool || delegateTool).handler,
		task: (modules?.task.taskTool || taskTool).handler,
	};
	const handler = metaToolHandlers[toolName];
	const composioTools =
		modules?.composioMeta.getComposioMetaTools() || getComposioMetaTools();
	if (!handler && composioTools.has(toolName)) {
		return await (
			modules?.composioMeta.executeComposioMetaTool || executeComposioMetaTool
		)(toolName, args);
	}
	if (!handler) throw new Error(`Meta-tool "${toolName}" not found`);
	return await handler({ ...args, _tabContext: tabContext });
}
