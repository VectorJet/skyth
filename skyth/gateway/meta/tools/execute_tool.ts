import type { ToolExecutionContext } from "@/base/base_agent/runtime/types";
import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";
import { findToolsTool } from "@/gateway/meta/tools/find_tools.ts";
import { listToolsTool } from "@/gateway/meta/tools/list_tools.ts";
import { batchToolsTool } from "@/gateway/meta/tools/batch_tools.ts";
import { listSkillsTool } from "@/gateway/meta/tools/list_skills.ts";
import { createSkillTool } from "@/gateway/meta/tools/create_skill.ts";
import { useSkillTool } from "@/gateway/meta/tools/use_skill.ts";
import { gatewayDebugTool } from "@/gateway/meta/tools/gateway_debug.ts";
import { gatewayReadmeTool } from "@/gateway/meta/tools/gateway_readme.ts";
import { delegateTool } from "@/gateway/meta/tools/delegate_tool.ts";
import { taskTool } from "@/gateway/meta/tools/task_tool.ts";
import {
	executeComposioMetaTool,
	getComposioMetaTools,
	setMcpRegistry as setComposioMetaMcpRegistry,
} from "@/gateway/meta/tools/composio_meta.ts";
import { formatCompletedToolResult } from "@/gateway/meta/tools/execution/results.ts";
import type { ExecuteToolRunners } from "@/gateway/meta/tools/execution/types.ts";
import { getToolRunStatus } from "@/gateway/meta/tools/execution/runs.ts";

export type { ExecuteToolRunners };
export { formatCompletedToolResult };
export { getToolRunStatus };

export {
	executeToolTool,
	setToolRegistry as setExecuteToolRegistry,
	setPipelineRegistry as setExecutePipelineRegistry,
	setMcpRegistry as setExecuteMcpRegistry,
	setSkillRegistry as setExecuteSkillRegistry,
	clearOldToolRuns,
	getAllToolRuns,
	markToolRunWaitRequested,
} from "@/gateway/meta/tools/execute_tool_handler.ts";

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
	setComposioMetaMcpRegistry(registry);
}

export function setSkillRegistry(registry: SkillRegistry) {
	skillRegistry = registry;
}

export function setExecuteRunners(next: ExecuteToolRunners) {
	runners = next;
}

function requireRunners(): ExecuteToolRunners {
	if (!runners) throw new Error("Capability runners not initialized");
	return runners;
}

export interface ExecuteDirectOptions {
	tabContext?: any;
	context?: ToolExecutionContext;
}

export async function executeToolDirect(
	toolName: string,
	toolArgs: Record<string, any> = {},
	options: ExecuteDirectOptions = {},
): Promise<any> {
	if (!toolRegistry) throw new Error("Tool registry not initialized");

	const tabContext = options.tabContext;
	if (tabContext && !tabContext.isToolAllowed(toolName)) {
		throw new Error(
			`Tool "${toolName}" is not available in the "${tabContext.activeTab}" tab. Switch to the appropriate tab to use this tool.`,
		);
	}

	const metaHandlers: Record<
		string,
		((args: Record<string, any>) => Promise<any>) | undefined
	> = {
		find_tools: findToolsTool.handler,
		list_tools: listToolsTool.handler,
		gateway_debug: gatewayDebugTool.handler,
		delegate: delegateTool.handler,
		task: taskTool.handler,
		batch_tools: batchToolsTool.handler,
		list_skills: listSkillsTool.handler,
		create_skill: createSkillTool.handler,
		use_skill: useSkillTool.handler,
		gateway_readme: gatewayReadmeTool.handler,
	};
	const metaHandler = metaHandlers[toolName];
	if (metaHandler) {
		return await metaHandler({
			...toolArgs,
			_tabContext: tabContext,
			_context: options.context,
		});
	}

	if (getComposioMetaTools().has(toolName)) {
		const output = await executeComposioMetaTool(toolName, toolArgs);
		return formatCompletedToolResult(toolName, output);
	}

	if (toolName.startsWith("mcp:")) {
		const output = await requireRunners().mcp.run(toolName, toolArgs, {
			activeTab: tabContext?.activeTab,
		});
		return formatCompletedToolResult(toolName, output);
	}

	if (toolName.startsWith("pipeline:")) {
		const result = await requireRunners().pipelines.run(toolName, toolArgs, {
			activeTab: tabContext?.activeTab,
		});
		return formatCompletedToolResult(toolName, result.output, result.duration);
	}

	if (toolName.startsWith("skill:")) {
		const output = await requireRunners().skills.run(toolName, toolArgs, {
			activeTab: tabContext?.activeTab,
		});
		return formatCompletedToolResult(toolName, output);
	}

	if (!toolRegistry.hasTool(toolName)) {
		const available = toolRegistry.listToolNames();
		const mcpAvailable = mcpRegistry
			? Array.from(mcpRegistry.getAllTools().keys())
			: [];
		const skillAvailable = skillRegistry ? skillRegistry.listSkillNames() : [];
		throw new Error(
			`Tool "${toolName}" not found. Available tools: ${available.join(", ")}. Available MCP tools: ${mcpAvailable.join(", ")}. Available skills: ${skillAvailable.join(", ")}. Use "pipeline:", "skill:", or "mcp:" prefix for pipelines/skills/MCP tools.`,
		);
	}

	const output = await requireRunners().tools.run(toolName, toolArgs, {
		activeTab: tabContext?.activeTab,
	});
	return formatCompletedToolResult(toolName, output);
}

export function getToolOrPipelineRun(
	runId: string,
): { run: any; isPipeline: boolean; effectiveName: string } | null {
	let run: any = null;
	let isPipeline = false;

	if (pipelineRegistry) {
		run = pipelineRegistry.getRunStatus(runId);
		if (run) isPipeline = true;
	}

	if (!run) {
		run = getToolRunStatus(runId);
	}

	if (!run) return null;

	return {
		run,
		isPipeline,
		effectiveName: isPipeline ? run.pipelineName : run.toolName,
	};
}
