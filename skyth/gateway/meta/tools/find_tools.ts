import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";
import type { ExecuteToolRunners } from "@/gateway/meta/tools/execute_tool.ts";
import { searchTools } from "@/gateway/meta/tools/find/search.ts";
import {
	type NegativeToolConstraints,
	toStringArray,
} from "@/gateway/meta/tools/find/types.ts";

let toolRegistry: ToolRegistry | null = null;
let pipelineRegistry: PipelineRegistry | null = null;
let mcpRegistry: MCPRegistry | null = null;
let skillRegistry: SkillRegistry | null = null;
let runners: ExecuteToolRunners | null = null;

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

export function setRunners(next: ExecuteToolRunners) {
	runners = next;
}

function requireRunners(): ExecuteToolRunners {
	if (!runners) throw new Error("Capability runners not initialized");
	return runners;
}

export const findToolsTool: ToolDefinition = {
	name: "find_tools",
	description: `Find the best gateway tools for a task using AX metadata and hybrid semantic ranking.

This is the primary on-demand discovery path. Prefer this over list_tools for task-specific tool selection.
It searches names, descriptions, AX summaries, trigger phrases, tags, related tools, common uses, intent examples, parameter names/descriptions, and negative guidance.

Returned matches include compact decision context: summary, category, visibility, tags, relatedTools, whenNotToUse, matchedSignals, parameters, and source.

Use this tool to:
- Discover relevant tools for a natural-language task
- Compare likely tools before choosing execute_tool
- Execute the top match directly with execute=true when the intent is unambiguous

Examples:
- find_tools({ query: "read several related source files" })
- find_tools({ query: "patch TypeScript files after reading context" })
- find_tools({ query: "run typecheck from terminal" })
- find_tools({ query: "up-to-date library docs" })
- find_tools({ query: "transcribe a YouTube video" })
- find_tools({ query: "bash", execute: true, args: { command: "ls", description: "List files" } })`,
	parameters: [
		{
			name: "query",
			description:
				"Natural language task/query. The ranker uses AX metadata, triggers, related tools, parameters, tags, summaries, descriptions, and negative guidance.",
			type: "string",
			required: true,
		},
		{
			name: "execute",
			description:
				"If true, execute the best matching tool immediately. Use only when the top match should clearly handle the task.",
			type: "boolean",
			required: false,
		},
		{
			name: "args",
			description: "Arguments to pass to the tool if execute=true",
			type: "object",
			required: false,
		},
		{
			name: "async",
			description:
				"If true and execute=true, run the selected tool in the background and return a runId. Prefer wait(runId) for long runs.",
			type: "boolean",
			required: false,
		},
		{
			name: "limit",
			description: "Maximum number of results to return (default: 10)",
			type: "number",
			required: false,
		},
		{
			name: "avoid",
			description:
				'Optional natural-language phrases to avoid/down-rank, e.g. ["file search", "bash", "editing files"]. Also inferred from query phrases like "not X" or "avoid X".',
			type: "array",
			required: false,
		},
		{
			name: "excludeTools",
			description:
				'Optional exact tool names to exclude from results, e.g. ["grep", "mcp:filesystem_search_files"]. Prefixless names also match prefixed tools by basename.',
			type: "array",
			required: false,
		},
		{
			name: "excludeCategories",
			description:
				'Optional categories to exclude from results, e.g. ["search", "file", "mcp"].',
			type: "array",
			required: false,
		},
		{
			name: "excludeTags",
			description:
				'Optional tags to exclude from results, e.g. ["filesystem", "grep"].',
			type: "array",
			required: false,
		},
		{
			name: "excludeSources",
			description:
				'Optional sources to exclude from results, e.g. ["mcp", "pipeline", "skill", "builtin"].',
			type: "array",
			required: false,
		},
	],
	handler: async (args) => {
		if (!toolRegistry) {
			throw new Error("Tool registry not initialized");
		}

		const {
			query,
			execute = false,
			args: toolArgs = {},
			async = false,
			limit = 10,
			avoid,
			excludeTools,
			excludeCategories,
			excludeTags,
			excludeSources,
			_tabContext,
		} = args;
		const constraints: NegativeToolConstraints = {
			avoid: toStringArray(avoid),
			excludeTools: toStringArray(excludeTools),
			excludeCategories: toStringArray(excludeCategories),
			excludeTags: toStringArray(excludeTags),
			excludeSources: toStringArray(excludeSources),
		};

		const allTools = new Map();

		// Add builtin/custom tools
		for (const [name, registered] of toolRegistry.getAllTools().entries()) {
			// Tab-aware filtering
			if (_tabContext && !_tabContext.isToolAllowed(name)) continue;

			allTools.set(name, {
				description: registered.definition.description,
				parameters: registered.definition.parameters,
				metadata: registered.definition.metadata,
				source: registered.definition.metadata?.tags?.includes("composio")
					? "composio"
					: registered.source,
			});
		}

		// Add pipelines as tools
		if (pipelineRegistry) {
			for (const [name, registered] of pipelineRegistry
				.getAllPipelines()
				.entries()) {
				const pipelineToolName = `pipeline:${name}`;

				// Tab-aware filtering
				if (_tabContext && !_tabContext.isToolAllowed(pipelineToolName))
					continue;

				allTools.set(pipelineToolName, {
					description: `Pipeline: ${registered.definition.description}`,
					parameters: registered.definition.parameters,
					metadata: { category: "pipeline", ...registered.definition.metadata },
					source: "pipeline",
				});
			}
		}

		// Add MCP tools
		if (mcpRegistry) {
			for (const [name, { server, tool }] of mcpRegistry
				.getAllTools()
				.entries()) {
				if (server === "composio") continue;
				const mcpToolName = `mcp:${name}`;

				// Tab-aware filtering
				if (_tabContext && !_tabContext.isToolAllowed(mcpToolName)) continue;

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
				allTools.set(mcpToolName, {
					description: tool.description,
					parameters: params,
					metadata: { category: "mcp", tags: [server] },
					source: "mcp",
				});
			}
		}

		// Add skills as executable registry entries
		if (skillRegistry) {
			for (const [name, registered] of skillRegistry.getAllSkills().entries()) {
				const skillToolName = `skill:${name}`;

				// Tab-aware filtering
				if (_tabContext && !_tabContext.isToolAllowed(skillToolName)) continue;

				allTools.set(skillToolName, {
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
					source: "skill",
				});
			}
		}

		const matches = searchTools(query, allTools, constraints);
		const results = matches.slice(0, limit);

		if (execute && results.length > 0) {
			const bestMatch = results[0]!;

			// Tab-aware execution check
			if (_tabContext && !_tabContext.isToolAllowed(bestMatch.name)) {
				return {
					executed: false,
					tool: bestMatch.name,
					error: `Tool "${bestMatch.name}" is not available in the "${_tabContext.activeTab}" tab.`,
					matches: results,
					activeTab: _tabContext.activeTab,
				};
			}

			try {
				// MCP tool execution
				if (bestMatch.name.startsWith("mcp:")) {
					const result = await requireRunners().mcp.run(
						bestMatch.name,
						toolArgs,
					);
					return {
						executed: true,
						tool: bestMatch.name,
						result,
					};
				}

				// Pipeline execution
				if (bestMatch.name.startsWith("pipeline:")) {
					const pipelineRunner = requireRunners().pipelines;

					if (async) {
						const { runId } = await pipelineRunner.start(
							bestMatch.name,
							toolArgs,
						);
						return {
							executed: true,
							tool: bestMatch.name,
							async: true,
							runId,
							message: `Pipeline execution started. Use tool_watch("${runId}") to wait for completion or tool_result("${runId}") to check status.`,
						};
					} else {
						const run = await pipelineRunner.run(bestMatch.name, toolArgs);
						return {
							executed: true,
							tool: bestMatch.name,
							async: false,
							result: run.output,
							duration: run.duration,
						};
					}
				}

				// Skill activation
				if (bestMatch.name.startsWith("skill:")) {
					const result = await requireRunners().skills.run(
						bestMatch.name,
						toolArgs,
					);
					return {
						executed: true,
						tool: bestMatch.name,
						result,
					};
				}

				// Regular tool execution
				const result = await requireRunners().tools.run(
					bestMatch.name,
					toolArgs,
				);
				return { executed: true, tool: bestMatch.name, result };
			} catch (error: any) {
				return {
					executed: false,
					tool: bestMatch.name,
					error: error.message,
					matches: results,
				};
			}
		}

		return {
			query,
			count: results.length,
			matches: results,
			activeTab: _tabContext?.activeTab || "unknown",
		};
	},
	metadata: {
		category: "meta",
		tags: ["discovery", "search", "meta"],
		version: "1.0.0",
		author: "system",
	},
};
