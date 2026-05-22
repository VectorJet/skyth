import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";
import { runBatchTools } from "@/gateway/meta/tools/batch_tools.ts";
import { executeToolDirect } from "@/gateway/meta/tools/execute_tool.ts";
import {
	getComposioMetaTools,
	executeComposioMetaTool,
} from "@/gateway/meta/tools/composio_meta.ts";
import type { ExecuteToolRunners } from "@/gateway/meta/tools/execution/types.ts";
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

export {
	clearOldToolRuns,
	getAllToolRuns,
	getToolRunStatus,
	markToolRunWaitRequested,
};

let toolRegistryForHandler: ToolRegistry | null = null;
let pipelineRegistryForHandler: PipelineRegistry | null = null;
let mcpRegistryForHandler: MCPRegistry | null = null;
let skillRegistryForHandler: SkillRegistry | null = null;
let runnersForHandler: ExecuteToolRunners | null = null;

function requireRunnersForHandler(): ExecuteToolRunners {
	if (!runnersForHandler) throw new Error("Capability runners not initialized");
	return runnersForHandler;
}

export function setToolRegistry(registry: ToolRegistry) {
	toolRegistryForHandler = registry;
}

export function setPipelineRegistry(registry: PipelineRegistry) {
	pipelineRegistryForHandler = registry;
}

export function setMcpRegistry(registry: MCPRegistry) {
	mcpRegistryForHandler = registry;
}

export function setSkillRegistry(registry: SkillRegistry) {
	skillRegistryForHandler = registry;
}

export function setExecuteRunners(runners: ExecuteToolRunners) {
	runnersForHandler = runners;
}

export const executeToolTool: ToolDefinition = {
	name: "execute_tool",
	description: executeToolDescription,
	parameters: executeToolParameters,
	handler: async (args) => {
		if (!toolRegistryForHandler) {
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
							requireRunnersForHandler().mcp.run(toolName, toolArgs),
						),
				);
				return asyncStartResponse(toolName, run, "MCP tool execution started");
			}

			const run = startToolRun(toolName, toolArgs, () =>
				requireRunnersForHandler().mcp.run(toolName, toolArgs),
			);
			return await waitForRunOrAutoAsync(run, toolName);
		}

		if (toolName.startsWith("pipeline:")) {
			const pipelineRunner = requireRunnersForHandler().pipelines;
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
			const skillRunner = requireRunnersForHandler().skills;
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
		if (!toolRegistryForHandler.hasTool(toolName)) {
			const available = toolRegistryForHandler.listToolNames();
			const mcpAvailable = mcpRegistryForHandler
				? Array.from(mcpRegistryForHandler.getAllTools().keys())
				: [];
			const skillAvailable = skillRegistryForHandler
				? skillRegistryForHandler.listSkillNames()
				: [];
			throw new Error(
				`Tool "${toolName}" not found. Available tools: ${available.join(", ")}. Available MCP tools: ${mcpAvailable.join(", ")}. Available skills: ${skillAvailable.join(", ")}. Use "pipeline:", "skill:", or "mcp:" prefix for pipelines/skills/MCP tools.`,
			);
		}

		if (async) {
			const run = createPendingToolRun(toolName, toolArgs);
			defer(
				() =>
					void executeToolAsync(
						run.runId,
						toolName,
						toolArgs,
						requireRunnersForHandler,
					),
			);
			return asyncStartResponse(toolName, run);
		}

		if (shouldForceAsync(toolName, toolArgs)) {
			const run = createPendingToolRun(toolName, toolArgs);
			defer(
				() =>
					void executeToolAsync(
						run.runId,
						toolName,
						toolArgs,
						requireRunnersForHandler,
					),
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
			return await requireRunnersForHandler().tools.run(toolName, toolArgs);
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
