import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";
import { normalizeAxToolDescriptor } from "@/gateway/meta/tools/ax.ts";

let toolRegistry: ToolRegistry | null = null;
let pipelineRegistry: PipelineRegistry | null = null;
let mcpRegistry: MCPRegistry | null = null;
let skillRegistry: SkillRegistry | null = null;

export function setToolRegistry(registry: ToolRegistry) {
	toolRegistry = registry;
}

export function setPipelineRegistry(registry: PipelineRegistry) {
	pipelineRegistry = registry;
}

export function setMcpRegistry(registry: MCPRegistry) {
	mcpRegistry = registry;
}

export function setSkillRegistry(registry: SkillRegistry) {
	skillRegistry = registry;
}

export const listToolsTool: ToolDefinition = {
	name: "list_tools",
	description: `List available tools with AX-aware compact summaries by default.

Use this for broad capability browsing or category/tag/source filtering. For task-specific discovery, prefer find_tools.
By default this returns compact entries only: name, summary, category, visibility, source, tags, and relatedTools. It intentionally avoids full schemas and long descriptions unless requested.

Request full detail only when you need exact parameters or AX guidance.

Examples:
- list_tools() - Compact summaries for all visible tools
- list_tools({ category: "file" }) - Compact file tools
- list_tools({ source: "pipeline" }) - Compact pipeline tools
- list_tools({ detail: "full", category: "edit" }) - Full schemas and AX guidance for edit tools
- list_tools({ includeSchemas: true }) - Full schemas`,
	parameters: [
		{
			name: "category",
			description:
				'Filter tools by AX/category value (e.g., "file", "search", "edit", "pipeline", "mcp", "skill", "meta")',
			type: "string",
			required: false,
		},
		{
			name: "tag",
			description: "Filter tools by tag",
			type: "string",
			required: false,
		},
		{
			name: "source",
			description:
				'Filter tools by source (e.g., "builtin", "custom", "pipeline", "mcp", "meta")',
			type: "string",
			required: false,
		},
		{
			name: "detail",
			description:
				'Output detail level. "compact" is the default; "full" includes descriptions, parameter schemas, metadata, and AX guidance.',
			type: "string",
			required: false,
			enum: ["compact", "full"],
		},
		{
			name: "includeSchemas",
			description:
				'If true, include full parameter schemas. Equivalent to detail="full".',
			type: "boolean",
			required: false,
		},
	],
	handler: async (args) => {
		if (!toolRegistry) {
			throw new Error("Tool registry not initialized");
		}

		const {
			category,
			tag,
			source,
			detail = "compact",
			includeSchemas = false,
			_tabContext,
		} = args;
		const full = includeSchemas === true || detail === "full";

		const allTools = [];

		function formatTool(name: string, tool: any, toolSource: string) {
			const descriptor = normalizeAxToolDescriptor(name, tool);
			const compact = {
				name,
				summary: descriptor.summary,
				category: descriptor.category,
				visibility: descriptor.visibility,
				source: toolSource,
				tags: descriptor.tags,
				relatedTools: descriptor.relatedTools,
			};

			if (!full) return compact;

			return {
				...compact,
				description: descriptor.description,
				triggerPhrases: descriptor.triggerPhrases,
				whenNotToUse: descriptor.whenNotToUse,
				commonUses: descriptor.commonUses,
				followUps: descriptor.followUps,
				intentExamples: descriptor.intentExamples,
				parameters: (tool.parameters || []).map((param: any) => ({
					name: param.name,
					description: param.description,
					type: param.type,
					required: param.required || false,
					default: param.default,
					enum: param.enum,
					properties: param.properties,
					items: param.items,
				})),
				metadata: tool.metadata,
			};
		}

		// Get builtin/custom tools
		for (const [name, registered] of toolRegistry.getAllTools().entries()) {
			const { definition, source: toolSource } = registered;
			const displaySource = definition.metadata?.tags?.includes("composio")
				? "composio"
				: toolSource;

			// Tab-aware filtering
			if (_tabContext && !_tabContext.isToolAllowed(name)) continue;

			const descriptor = normalizeAxToolDescriptor(name, definition);
			if (category && descriptor.category !== category) continue;
			if (tag && !definition.metadata?.tags?.includes(tag)) continue;
			if (source && source !== displaySource) continue;

			allTools.push(formatTool(name, definition, displaySource));
		}

		// Get pipelines as tools
		if (pipelineRegistry) {
			for (const [name, registered] of pipelineRegistry
				.getAllPipelines()
				.entries()) {
				const { definition } = registered;

				const pipelineToolName = `pipeline:${name}`;

				// Tab-aware filtering
				if (_tabContext && !_tabContext.isToolAllowed(pipelineToolName))
					continue;

				if (category && category !== "pipeline") continue;
				const pipelineTool = {
					description: `Pipeline: ${definition.description}`,
					parameters: definition.parameters,
					metadata: { category: "pipeline", ...definition.metadata },
				};
				if (tag && !pipelineTool.metadata?.tags?.includes(tag)) continue;
				if (source && source !== "pipeline") continue;

				allTools.push(formatTool(pipelineToolName, pipelineTool, "pipeline"));
			}
		}

		// Get MCP tools
		if (mcpRegistry) {
			for (const [name, { server, tool }] of mcpRegistry
				.getAllTools()
				.entries()) {
				if (server === "composio") continue;
				const mcpToolName = `mcp:${name}`;

				// Tab-aware filtering
				if (_tabContext && !_tabContext.isToolAllowed(mcpToolName)) continue;

				if (category && category !== "mcp") continue;
				if (source && source !== "mcp") continue;
				if (
					tag &&
					server !== tag &&
					!tool.description?.toLowerCase?.().includes(tag.toLowerCase())
				)
					continue;

				const params: any[] = [];
				const schema = tool.inputSchema;
				if (schema?.properties) {
					for (const [paramName, paramDef] of Object.entries(
						schema.properties,
					)) {
						const def = paramDef as any;
						params.push({
							name: paramName,
							description: def.description || "",
							type: def.type || "string",
							required: schema.required?.includes(paramName) || false,
							enum: def.enum,
						});
					}
				}

				allTools.push(
					formatTool(
						mcpToolName,
						{
							description: tool.description,
							parameters: params,
							metadata: { category: "mcp", tags: [server] },
						},
						"mcp",
					),
				);
			}
		}

		// Get skills as registry-backed activatable entries
		if (skillRegistry) {
			for (const [name, registered] of skillRegistry.getAllSkills().entries()) {
				const skillToolName = `skill:${name}`;

				// Tab-aware filtering
				if (_tabContext && !_tabContext.isToolAllowed(skillToolName)) continue;

				if (category && category !== "skill" && category !== "skills") continue;
				if (source && source !== "skill") continue;
				if (
					tag &&
					!["skill", "agent-skill", ...registered.definition.resources].some(
						(value) => value.includes(tag),
					)
				)
					continue;

				allTools.push(
					formatTool(
						skillToolName,
						{
							description: `Skill: ${registered.definition.description}`,
							parameters: [
								{
									name: "task",
									description:
										"Current task summary to bind to the loaded skill instructions",
									type: "string",
									required: false,
								},
								{
									name: "resourcePaths",
									description:
										"Optional skill-relative resource files to load with the skill",
									type: "array",
									required: false,
								},
							],
							metadata: {
								category: "skill",
								tags: ["skill", "agent-skill"],
								resources: registered.definition.resources,
								ax: registered.definition.ax,
							},
						},
						"skill",
					),
				);
			}
		}

		return {
			count: allTools.length,
			detail: full ? "full" : "compact",
			schemasIncluded: full,
			tools: allTools,
			filters: {
				category: category || null,
				tag: tag || null,
				source: source || null,
			},
			activeTab: _tabContext?.activeTab || "unknown",
		};
	},
	metadata: {
		category: "meta",
		tags: ["discovery", "list", "meta"],
		version: "1.0.0",
		author: "system",
	},
};
