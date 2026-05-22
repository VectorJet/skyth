import type { ToolRuntime } from "@/base/base_agent/runtime/types";
import type { GatewayRuntimeServices } from "@/gateway/core/runtime";
import type { MCPRegistry } from "@/gateway/registries/mcp";
import type { PipelineRegistry } from "@/gateway/registries/pipelines";
import type { SkillRegistry } from "@/gateway/registries/skills";
import type {
	ToolDefinition,
	ToolParameter,
	ToolRegistry,
} from "@/gateway/registries/tools";
import { executeToolDirect } from "@/gateway/meta/tools/execute_tool";
import {
	batchToolsTool,
	createSkillTool,
	delegateTool,
	findToolsTool,
	gatewayDebugTool,
	gatewayReadmeTool,
	listSkillsTool,
	listToolsTool,
	setExecuteMcpRegistry,
	setExecutePipelineRegistry,
	setExecuteRunners,
	setExecuteSkillRegistry,
	setExecuteToolRegistry,
	setFindToolsMcpRegistry,
	setFindToolsPipelineRegistry,
	setFindToolsRunners,
	setFindToolsSkillRegistry,
	setFindToolsToolRegistry,
	setListToolsMcpRegistry,
	setListToolsPipelineRegistry,
	setListToolsSkillRegistry,
	setListToolsToolRegistry,
	taskTool,
	toolResultTool,
	toolWatchTool,
	useSkillTool,
	waitTool,
} from "@/gateway/meta/tools";

export interface GatewayToolRuntimeOptions {
	toolRegistry: ToolRegistry;
	pipelineRegistry?: PipelineRegistry;
	mcpRegistry?: MCPRegistry;
	skillRegistry?: SkillRegistry;
	runtimeServices?: GatewayRuntimeServices;
}

const META_TOOLS: ToolDefinition[] = [
	findToolsTool,
	listToolsTool,
	delegateTool,
	taskTool,
	batchToolsTool,
	toolWatchTool,
	waitTool,
	toolResultTool,
	listSkillsTool,
	createSkillTool,
	useSkillTool,
	gatewayDebugTool,
	gatewayReadmeTool,
];

export class GatewayToolRuntime implements ToolRuntime {
	private readonly toolRegistry: ToolRegistry;
	private readonly pipelineRegistry?: PipelineRegistry;
	private readonly mcpRegistry?: MCPRegistry;
	private readonly skillRegistry?: SkillRegistry;

	constructor(options: GatewayToolRuntimeOptions) {
		this.toolRegistry = options.toolRegistry;
		this.pipelineRegistry = options.pipelineRegistry;
		this.mcpRegistry = options.mcpRegistry;
		this.skillRegistry = options.skillRegistry;
		this.configureMetaTools(options.runtimeServices);
	}

	getDefinitions(): Array<Record<string, unknown>> {
		return [
			...META_TOOLS.map(toFunctionDefinition),
			...this.toolDefinitions(),
			...this.pipelineDefinitions(),
			...this.skillDefinitions(),
			...this.mcpDefinitions(),
		];
	}

	async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
		return await executeToolDirect(name, args);
	}

	private configureMetaTools(runtimeServices?: GatewayRuntimeServices): void {
		setFindToolsToolRegistry(this.toolRegistry);
		setListToolsToolRegistry(this.toolRegistry);
		setExecuteToolRegistry(this.toolRegistry);

		if (this.pipelineRegistry) {
			setFindToolsPipelineRegistry(this.pipelineRegistry);
			setListToolsPipelineRegistry(this.pipelineRegistry);
			setExecutePipelineRegistry(this.pipelineRegistry);
		}
		if (this.mcpRegistry) {
			setFindToolsMcpRegistry(this.mcpRegistry);
			setListToolsMcpRegistry(this.mcpRegistry);
			setExecuteMcpRegistry(this.mcpRegistry);
		}
		if (this.skillRegistry) {
			setFindToolsSkillRegistry(this.skillRegistry);
			setListToolsSkillRegistry(this.skillRegistry);
			setExecuteSkillRegistry(this.skillRegistry);
		}
		if (runtimeServices) {
			setFindToolsRunners(runtimeServices.runners);
			setExecuteRunners(runtimeServices.runners);
		}
	}

	private toolDefinitions(): Array<Record<string, unknown>> {
		return [...this.toolRegistry.getAllTools().values()].map(({ definition }) =>
			toFunctionDefinition(definition),
		);
	}

	private pipelineDefinitions(): Array<Record<string, unknown>> {
		if (!this.pipelineRegistry) return [];
		return [...this.pipelineRegistry.getAllPipelines().values()].map(
			({ definition }) =>
				toFunctionDefinition({
					name: `pipeline:${definition.name}`,
					description: `Pipeline: ${definition.description}`,
					parameters: definition.parameters,
					handler: async () => undefined,
					metadata: definition.metadata,
				}),
		);
	}

	private skillDefinitions(): Array<Record<string, unknown>> {
		if (!this.skillRegistry) return [];
		return [...this.skillRegistry.getAllSkills().values()].map(
			({ definition }) =>
				toFunctionDefinition({
					name: `skill:${definition.name}`,
					description: `Load and apply skill: ${definition.description}`,
					parameters: [
						{
							name: "task",
							description: "The task the skill should guide",
							type: "string",
							required: false,
						},
						{
							name: "resourcePaths",
							description: "Optional skill resource paths to load",
							type: "array",
							required: false,
						},
					],
					handler: async () => undefined,
					metadata: {
						category: "skill",
						ax: definition.ax,
					},
				}),
		);
	}

	private mcpDefinitions(): Array<Record<string, unknown>> {
		if (!this.mcpRegistry) return [];
		return [...this.mcpRegistry.getAllTools().entries()].map(([name, entry]) =>
			toFunctionDefinition({
				name: `mcp:${name}`,
				description: entry.tool.description || `MCP tool from ${entry.server}`,
				parameters: mcpSchemaToParameters(entry.tool.inputSchema),
				handler: async () => undefined,
				metadata: {
					category: "mcp",
					tags: [entry.server],
				},
			}),
		);
	}
}

function toFunctionDefinition(tool: ToolDefinition): Record<string, unknown> {
	return {
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: parametersToJsonSchema(tool.parameters),
		},
	};
}

function parametersToJsonSchema(
	parameters: ToolParameter[] = [],
): Record<string, unknown> {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];
	for (const parameter of parameters) {
		properties[parameter.name] = {
			type: parameter.type,
			description: parameter.description,
			default: parameter.default,
			enum: parameter.enum,
			properties: parameter.properties,
			items: parameter.items,
		};
		if (parameter.required) required.push(parameter.name);
	}
	return {
		type: "object",
		properties,
		...(required.length ? { required } : {}),
	};
}

function mcpSchemaToParameters(schema: any): ToolParameter[] {
	if (!schema?.properties || typeof schema.properties !== "object") return [];
	const required = new Set<string>(
		Array.isArray(schema.required) ? schema.required : [],
	);
	return Object.entries(schema.properties).map(([name, value]) => {
		const property = value as Record<string, any>;
		return {
			name,
			description:
				typeof property.description === "string" ? property.description : "",
			type: normalizeParameterType(property.type),
			required: required.has(name),
			enum: Array.isArray(property.enum) ? property.enum : undefined,
		};
	});
}

function normalizeParameterType(input: unknown): ToolParameter["type"] {
	if (
		input === "number" ||
		input === "boolean" ||
		input === "object" ||
		input === "array"
	) {
		return input;
	}
	return "string";
}
