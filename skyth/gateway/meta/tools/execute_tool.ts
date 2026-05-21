import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";
import {
	batchToolsTool,
	runBatchTools,
} from "@/gateway/meta/tools/batch_tools.ts";
import { findToolsTool } from "@/gateway/meta/tools/find_tools.ts";
import { listToolsTool } from "@/gateway/meta/tools/list_tools.ts";
import { listSkillsTool } from "@/gateway/meta/tools/list_skills.ts";
import { createSkillTool } from "@/gateway/meta/tools/create_skill.ts";
import { useSkillTool } from "@/gateway/meta/tools/use_skill.ts";
import { gatewayDebugTool } from "@/gateway/meta/tools/gateway_debug.ts";
import { gatewayReadmeTool } from "@/gateway/meta/tools/gateway_readme.ts";
import {
	executeComposioMetaTool,
	getComposioMetaTools,
	setMcpRegistry as setComposioMetaMcpRegistry,
} from "@/gateway/meta/tools/composio_meta.ts";
import type {
	ExecuteToolRunners,
	ToolRun,
} from "@/gateway/meta/tools/execution/types.ts";
import { formatCompletedToolResult } from "@/gateway/meta/tools/execution/results.ts";
import {
	asyncStartResponse,
	clearOldToolRuns,
	createPendingToolRun,
	defer,
	getAllToolRuns,
	getToolRunStatus,
	markToolRunWaitRequested,
	notifyToolRunComplete,
	startToolRun,
	waitForRunOrAutoAsync,
} from "@/gateway/meta/tools/execution/runs.ts";
import {
	executeRunnerAsync,
	executeToolAsync,
	shouldForceAsync,
} from "@/gateway/meta/tools/execution/async-execution.ts";
import {
	executeToolDescription,
	executeToolParameters,
} from "@/gateway/meta/tools/execution/schema.ts";

export type { ExecuteToolRunners };
export { formatCompletedToolResult };
export { clearOldToolRuns, getAllToolRuns, getToolRunStatus, markToolRunWaitRequested };

let toolRegistry: ToolRegistry | null = null;
let pipelineRegistry: PipelineRegistry | null = null;
let mcpRegistry: MCPRegistry | null = null;
let skillRegistry: SkillRegistry | null = null;

let runners: ExecuteToolRunners | null = null;

export function setToolRegistry(registry: ToolRegistry) { toolRegistry = registry; }

export function setPipelineRegistry(registry: PipelineRegistry) { pipelineRegistry = registry; }

export function setMcpRegistry(registry: MCPRegistry) { mcpRegistry = registry; setComposioMetaMcpRegistry(registry); }

export function setSkillRegistry(registry: SkillRegistry) { skillRegistry = registry; }

export function setExecuteRunners(next: ExecuteToolRunners) { runners = next; }

function requireRunners(): ExecuteToolRunners { if (!runners) throw new Error("Capability runners not initialized"); return runners; }

export interface ExecuteDirectOptions {
	tabContext?: any;
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
		batch_tools: batchToolsTool.handler,
		list_skills: listSkillsTool.handler,
		create_skill: createSkillTool.handler,
		use_skill: useSkillTool.handler,
		gateway_readme: gatewayReadmeTool.handler,
	};
	const metaHandler = metaHandlers[toolName];
	if (metaHandler) {
		return await metaHandler({ ...toolArgs, _tabContext: tabContext });
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

export const executeToolTool: ToolDefinition = {
	name: "execute_tool",
	description: executeToolDescription,
	parameters: executeToolParameters,
	handler: async (args) => {
		if (!toolRegistry) {
			throw new Error("Tool registry not initialized");
		}

		const {
			tool: toolName,
			args: toolArgs = {},
			async = false,
			_tabContext,
		} = args;
		if (typeof toolName !== "string" || toolName.trim() === "") {
			throw new Error(
				'execute_tool requires a non-empty string "tool" argument',
			);
		}

		if (_tabContext && !_tabContext.isToolAllowed(toolName)) {
			throw new Error(
				`Tool "${toolName}" is not available in the "${_tabContext.activeTab}" tab. Switch to the appropriate tab to use this tool.`,
			);
		}

		if (toolName.startsWith("mcp:")) {
			if (async) {
				const run = createPendingToolRun(toolName, toolArgs);
				defer(
					() =>
						void executeRunnerAsync(run.runId, toolName, () =>
							requireRunners().mcp.run(toolName, toolArgs),
						),
				);
				return asyncStartResponse(toolName, run, "MCP tool execution started");
			}

			const run = startToolRun(toolName, toolArgs, () =>
				requireRunners().mcp.run(toolName, toolArgs),
			);
			return await waitForRunOrAutoAsync(run, toolName);
		}

		if (toolName.startsWith("pipeline:")) {
			const pipelineRunner = requireRunners().pipelines;
			pipelineRunner.assertAvailable(toolName);

			if (async) {
				const { runId: pipelineRunId } = await pipelineRunner.start(
					toolName,
					toolArgs,
				);
				const run = startToolRun(
					toolName,
					toolArgs,
					async () => (await pipelineRunner.wait(pipelineRunId)).output,
				);
				run.notifyOnComplete = false;
				return {
					tool: toolName,
					async: true,
					runId: run.runId,
					pipelineRunId,
					status: "pending",
					message: `Pipeline execution started. Use wait("${run.runId}") and end your response if you want a completion ping, or use tool_result("${run.runId}") to check status manually.`,
				};
			} else {
				const run = startToolRun(
					toolName,
					toolArgs,
					async () => (await pipelineRunner.run(toolName, toolArgs)).output,
				);
				return await waitForRunOrAutoAsync(run, toolName);
			}
		}

		if (toolName.startsWith("skill:")) {
			const skillRunner = requireRunners().skills;
			skillRunner.assertAvailable(toolName);
			const executor = () => skillRunner.run(toolName, toolArgs);

			if (async) {
				const run = createPendingToolRun(toolName, toolArgs);
				defer(() => {
					void (async () => {
						try {
							run.status = "running";
							run.output = await executor();
							run.status = "completed";
							run.completedAt = new Date();
							run.duration =
								run.completedAt.getTime() - run.startedAt.getTime();
						} catch (error: any) {
							run.status = "failed";
							run.error = error?.message || String(error);
							run.completedAt = new Date();
							run.duration =
								run.completedAt.getTime() - run.startedAt.getTime();
						} finally {
							if (run.notifyOnComplete) void notifyToolRunComplete(run);
						}
					})();
				});
				return asyncStartResponse(toolName, run, "Skill activation started");
			}

			const run = startToolRun(toolName, toolArgs, executor);
			return await waitForRunOrAutoAsync(run, toolName);
		}

		if (toolName === "batch_tools") {
			const calls = Array.isArray(toolArgs.calls) ? toolArgs.calls : [];
			const executor = () =>
				runBatchTools(calls, {
					concurrency: toolArgs.concurrency,
					tabContext: _tabContext,
				});

			if (async) {
				const run = createPendingToolRun(toolName, toolArgs);
				defer(() => {
					void (async () => {
						try {
							run.status = "running";
							run.output = await executor();
							run.status = "completed";
							run.completedAt = new Date();
							run.duration =
								run.completedAt.getTime() - run.startedAt.getTime();
						} catch (error: any) {
							run.status = "failed";
							run.error = error?.message || String(error);
							run.completedAt = new Date();
							run.duration =
								run.completedAt.getTime() - run.startedAt.getTime();
						} finally {
							if (run.notifyOnComplete) void notifyToolRunComplete(run);
						}
					})();
				});
				return asyncStartResponse(
					toolName,
					run,
					"Batch tool execution started",
				);
			}

			const run = startToolRun(toolName, toolArgs, executor);
			return await waitForRunOrAutoAsync(run, toolName);
		}

		if (
			toolName === "gateway_readme" ||
			toolName === "find_tools" ||
			toolName === "list_tools" ||
			toolName === "gateway_debug" ||
			toolName === "list_skills" ||
			toolName === "create_skill" ||
			toolName === "use_skill"
		) {
			return await executeToolDirect(toolName, toolArgs, {
				tabContext: _tabContext,
			});
		}

		if (getComposioMetaTools().has(toolName)) {
			return await executeToolDirect(toolName, toolArgs, {
				tabContext: _tabContext,
			});
		}

		// Regular tool execution
		if (!toolRegistry.hasTool(toolName)) {
			const available = toolRegistry.listToolNames();
			const mcpAvailable = mcpRegistry
				? Array.from(mcpRegistry.getAllTools().keys())
				: [];
			const skillAvailable = skillRegistry
				? skillRegistry.listSkillNames()
				: [];
			throw new Error(
				`Tool "${toolName}" not found. Available tools: ${available.join(", ")}. Available MCP tools: ${mcpAvailable.join(", ")}. Available skills: ${skillAvailable.join(", ")}. Use "pipeline:", "skill:", or "mcp:" prefix for pipelines/skills/MCP tools.`,
			);
		}

		if (async) {
			const run = createPendingToolRun(toolName, toolArgs);
			defer(
				() =>
					void executeToolAsync(run.runId, toolName, toolArgs, requireRunners),
			);
			return asyncStartResponse(toolName, run);
		}

		if (shouldForceAsync(toolName, toolArgs)) {
			const run = createPendingToolRun(toolName, toolArgs);
			defer(
				() =>
					void executeToolAsync(run.runId, toolName, toolArgs, requireRunners),
			);
			return {
				...asyncStartResponse(
					toolName,
					run,
					"Tool may take a while, so the gateway started it in the background",
				),
				autoAsync: true,
			};
		}

		const run = startToolRun(toolName, toolArgs, async () => {
			return await requireRunners().tools.run(toolName, toolArgs);
		});
		return await waitForRunOrAutoAsync(run, toolName);
	},
	metadata: {
		category: "meta",
		tags: ["execution", "meta"],
		version: "1.0.0",
		author: "system",
	},
};
