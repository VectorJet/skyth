import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";
import { randomUUID } from "crypto";
import { getRuntime } from "@/gateway/channels/runtime.ts";
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
	McpRunner,
	PipelineRunner,
	SkillRunner,
	ToolRunner,
} from "@/gateway/runners/index.ts";

let toolRegistry: ToolRegistry | null = null;
let pipelineRegistry: PipelineRegistry | null = null;
let mcpRegistry: MCPRegistry | null = null;
let skillRegistry: SkillRegistry | null = null;

export interface ExecuteToolRunners {
	tools: ToolRunner;
	pipelines: PipelineRunner;
	skills: SkillRunner;
	mcp: McpRunner;
}

let runners: ExecuteToolRunners | null = null;

export function setExecuteRunners(next: ExecuteToolRunners) {
	runners = next;
}

function requireRunners(): ExecuteToolRunners {
	if (!runners) throw new Error("Capability runners not initialized");
	return runners;
}

export interface ToolRun {
	runId: string;
	toolName: string;
	status: "pending" | "running" | "completed" | "failed";
	input: Record<string, any>;
	output?: any;
	error?: string;
	startedAt: Date;
	completedAt?: Date;
	duration?: number;
	notifyOnComplete?: boolean;
	waitRequested?: boolean;
}

const toolRuns = new Map<string, ToolRun>();

const AUTO_ASYNC_AFTER_MS = Number(
	process.env.CLAUDE_GATEWAY_TOOL_AUTO_ASYNC_MS ?? 150000,
);
const COMPLETION_INLINE_MAX_CHARS = Number(
	process.env.CLAUDE_GATEWAY_TOOL_COMPLETE_INLINE_CHARS ?? 4000,
);
const ASYNC_START_DELAY_MS = Number(
	process.env.CLAUDE_GATEWAY_TOOL_ASYNC_START_DELAY_MS ?? 50,
);

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

function stringifyForGateway(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

async function notifyToolRunComplete(run: ToolRun): Promise<void> {
	if (process.env.CLAUDE_GATEWAY_TOOL_COMPLETE_NOTIFY === "0") return;
	if (!run.waitRequested) return;

	try {
		const rt = getRuntime();
		const web = rt.channelManager.get("web") as any;
		const tabIds =
			typeof web?.knownTabIds === "function" && web.knownTabIds().length > 0
				? web.knownTabIds()
				: ["default"];

		const header =
			run.status === "completed"
				? `Tool run complete.\nrunId: ${run.runId}\ntool: ${run.toolName}\nduration_ms: ${run.duration ?? 0}`
				: `Tool run failed.\nrunId: ${run.runId}\ntool: ${run.toolName}\nduration_ms: ${run.duration ?? 0}\nerror: ${run.error ?? "Unknown error"}`;

		let body = header;
		if (run.status === "completed") {
			const output = stringifyForGateway(run.output);
			if (output.length <= COMPLETION_INLINE_MAX_CHARS) {
				body += `\n\nOutput:\n\`\`\`json\n${output}\n\`\`\``;
			} else {
				body += `\n\nOutput is ${output.length} chars, which is too large to inline. Use tool_result with runId ${run.runId} to fetch it.`;
			}
		}

		await Promise.allSettled(
			tabIds.map((tabId: string) =>
				rt.channelManager.send("web", tabId, body, { fromGateway: true }),
			),
		);
	} catch (err) {
		console.warn(
			"[ToolExecution] failed to notify Claude about completed run:",
			err,
		);
	}
}

function startToolRun(
	toolName: string,
	input: Record<string, any>,
	executor: () => Promise<any>,
): ToolRun {
	const runId = randomUUID();
	const run: ToolRun = {
		runId,
		toolName,
		status: "pending",
		input,
		startedAt: new Date(),
	};
	toolRuns.set(runId, run);

	void (async () => {
		try {
			run.status = "running";
			console.log(
				`[ToolExecution] Starting execution of run ${runId} (tool: ${toolName})`,
			);
			run.output = await executor();
			run.status = "completed";
			run.completedAt = new Date();
			run.duration = run.completedAt.getTime() - run.startedAt.getTime();
			console.log(
				`[ToolExecution] Run ${runId} completed in ${run.duration}ms`,
			);
		} catch (error: any) {
			run.status = "failed";
			run.error = error.message || "Unknown error";
			run.completedAt = new Date();
			run.duration = run.completedAt.getTime() - run.startedAt.getTime();
			console.error(`[ToolExecution] Run ${runId} failed: ${run.error}`);
		} finally {
			if (!run.notifyOnComplete) return;
			void notifyToolRunComplete(run);
		}
	})();

	return run;
}

function createPendingToolRun(
	toolName: string,
	input: Record<string, any>,
): ToolRun {
	const runId = randomUUID();
	const run: ToolRun = {
		runId,
		toolName,
		status: "pending",
		input,
		startedAt: new Date(),
		notifyOnComplete: false,
	};
	toolRuns.set(runId, run);
	return run;
}

function defer(callback: () => void): void {
	setTimeout(callback, Math.max(0, ASYNC_START_DELAY_MS));
}

function shouldForceAsync(
	toolName: string,
	toolArgs: Record<string, any>,
): boolean {
	const configured = (process.env.CLAUDE_GATEWAY_TOOL_FORCE_ASYNC ?? "")
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	if (configured.includes(toolName)) return true;

	// Reindex/import can monopolize the Bun event loop with SQLite and JSON
	// parsing. Force it to return a runId before starting work so Claude sees a
	// valid tool result instead of an MCP transport timeout.
	return (
		toolName === "memory_embed" ||
		(toolName === "memory_import" &&
			(toolArgs.mode === "reindex" || typeof toolArgs.filePath === "string"))
	);
}

function asyncStartResponse(
	toolName: string,
	run: ToolRun,
	reason = "Tool execution started",
) {
	return {
		tool: toolName,
		async: true,
		runId: run.runId,
		status: "pending",
		message: `${reason}. If you want the gateway to notify you when runId ${run.runId} finishes, call wait with that runId and end your response. Otherwise use tool_result to check it manually.`,
	};
}

function isGatewayMultimodalResult(
	value: any,
): value is { content: any[]; path?: string; mimeType?: string } {
	return Boolean(
		value &&
			typeof value === "object" &&
			value.__gateway_multimodal__ === true &&
			Array.isArray(value.content),
	);
}

/**
 * Detect MCP-native tool results that contain non-text content blocks (images,
 * resources, etc.). These need to be promoted to the top-level `content` array
 * so the protocol handler passes them through as multimodal blocks instead of
 * JSON-stringifying the entire payload (which overflows context on large images).
 */
function isMcpContentResult(
	value: any,
): value is { content: any[]; isError?: boolean } {
	return Boolean(
		value && typeof value === "object" && Array.isArray(value.content),
	);
}

function mcpTextContent(content: any[]): string | undefined {
	const text = content
		.filter(
			(item: any) => item?.type === "text" && typeof item.text === "string",
		)
		.map((item: any) => item.text)
		.join("\n");
	return text || undefined;
}

function isMcpNativeResult(value: any): value is { content: any[] } {
	return Boolean(
		value &&
			typeof value === "object" &&
			Array.isArray(value.content) &&
			value.content.some(
				(item: any) =>
					item && (item.type === "image" || item.type === "resource"),
			),
	);
}

export function formatCompletedToolResult(
	toolName: string,
	output: any,
	duration?: number,
): Record<string, unknown> {
	// Builtin tools (e.g. load_media_file) that explicitly signal multimodal output.
	if (isGatewayMultimodalResult(output)) {
		return {
			content: output.content,
			structuredContent: {
				tool: toolName,
				async: false,
				path: output.path,
				mimeType: output.mimeType,
				executionTime: duration,
			},
		};
	}

	// MCP tools (e.g. chrome-devtools screenshot) that return a native content
	// array containing image/resource blocks. Promote to top-level so the
	// protocol handler passes them as real multimodal content instead of a
	// giant JSON-stringified text blob.
	if (isMcpNativeResult(output)) {
		// Separate text blocks from media blocks so Claude sees both.
		const textBlocks = output.content.filter(
			(item: any) => item.type === "text",
		);
		const mediaBlocks = output.content.filter(
			(item: any) => item.type !== "text",
		);
		const metaText = JSON.stringify(
			{ tool: toolName, async: false, executionTime: duration },
			null,
			2,
		);

		return {
			content: [
				{ type: "text", text: metaText },
				...textBlocks,
				...mediaBlocks,
			],
			structuredContent: {
				tool: toolName,
				async: false,
				executionTime: duration,
			},
		};
	}

	// Text-only MCP results (Composio, Context7, filesystem, etc.) are still
	// native MCP content. Keep the content array for MCP clients, but mirror the
	// text into structuredContent so clients/renderers that primarily inspect
	// structuredContent do not show only `{ "isError": false }`.
	if (isMcpContentResult(output)) {
		const { content, ...rest } = output;
		return {
			content,
			structuredContent: {
				tool: toolName,
				async: false,
				executionTime: duration,
				...rest,
				text: mcpTextContent(content),
			},
		};
	}

	return output ?? {};
}

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

async function waitForRunOrAutoAsync(
	run: ToolRun,
	toolName: string,
): Promise<Record<string, unknown>> {
	const timeout = Math.max(0, AUTO_ASYNC_AFTER_MS);
	const finished = await new Promise<boolean>((resolve) => {
		if (run.status === "completed" || run.status === "failed") {
			resolve(true);
			return;
		}

		const startedAt = Date.now();
		const timer = setInterval(() => {
			if (run.status === "completed" || run.status === "failed") {
				clearInterval(timer);
				resolve(true);
				return;
			}
			if (Date.now() - startedAt >= timeout) {
				clearInterval(timer);
				resolve(false);
			}
		}, 50);
	});

	if (finished) {
		if (run.status === "failed") throw new Error(run.error ?? "Unknown error");
		return formatCompletedToolResult(toolName, run.output, run.duration);
	}

	run.notifyOnComplete = false;
	return {
		tool: toolName,
		async: true,
		autoAsync: true,
		runId: run.runId,
		status: run.status,
		message: `Tool still running after ${timeout}ms. Call tool_watch with runId "${run.runId}" and timeout 295000 to wait for completion.`,
	};
}

async function executeToolAsync(
	runId: string,
	toolName: string,
	args: Record<string, any>,
): Promise<void> {
	const run = toolRuns.get(runId);
	if (!run) return;

	try {
		run.status = "running";
		console.log(
			`[ToolExecution] Starting execution of run ${runId} (tool: ${toolName})`,
		);

		const result = await requireRunners().tools.run(toolName, args);

		run.status = "completed";
		run.output = result;
		run.completedAt = new Date();
		run.duration = run.completedAt.getTime() - run.startedAt.getTime();

		console.log(`[ToolExecution] Run ${runId} completed in ${run.duration}ms`);
		void notifyToolRunComplete(run);
	} catch (error: any) {
		run.status = "failed";
		run.error = error.message || "Unknown error";
		run.completedAt = new Date();
		run.duration = run.completedAt.getTime() - run.startedAt.getTime();

		console.error(`[ToolExecution] Run ${runId} failed: ${run.error}`);
		void notifyToolRunComplete(run);
	}
}

async function executeRunnerAsync(
	runId: string,
	toolName: string,
	args: Record<string, any>,
	executor: () => Promise<any>,
): Promise<void> {
	const run = toolRuns.get(runId);
	if (!run) return;

	try {
		run.status = "running";
		console.log(
			`[ToolExecution] Starting runner execution of run ${runId} (tool: ${toolName})`,
		);

		const result = await executor();

		run.status = "completed";
		run.output = result;
		run.completedAt = new Date();
		run.duration = run.completedAt.getTime() - run.startedAt.getTime();

		console.log(
			`[ToolExecution] Runner run ${runId} completed in ${run.duration}ms`,
		);
		void notifyToolRunComplete(run);
	} catch (error: any) {
		run.status = "failed";
		run.error = error.message || "Unknown error";
		run.completedAt = new Date();
		run.duration = run.completedAt.getTime() - run.startedAt.getTime();

		console.error(`[ToolExecution] Runner run ${runId} failed: ${run.error}`);
		void notifyToolRunComplete(run);
	}
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
		run = toolRuns.get(runId);
	}

	if (!run) return null;

	return {
		run,
		isPipeline,
		effectiveName: isPipeline ? run.pipelineName : run.toolName,
	};
}

export function markToolRunWaitRequested(runId: string): ToolRun | undefined {
	const run = toolRuns.get(runId);
	if (!run) return undefined;
	run.notifyOnComplete = true;
	run.waitRequested = true;
	return run;
}

export const executeToolTool: ToolDefinition = {
	name: "execute_tool",
	description: `Execute a gateway tool by exact name with the provided arguments.

Use find_tools first when you are unsure which tool fits the task. execute_tool is the execution path once the tool name is known.

Supported names:
- Built-in tools: "read", "grep", "apply_patch", "bash", etc.
- Pipelines: "pipeline:<name>"
- Skills: "skill:<name>"
- MCP tools: "mcp:<server_tool>"
- Selected meta-tools: "gateway_readme", "find_tools", "list_tools", "batch_tools", "list_skills", "create_skill", "use_skill"
- Composio meta-tools: "composio_search_tools", "composio_manage_connections", "composio_get_tool_schemas", "composio_multi_execute_tool", etc.

Async UX:
- Set async=true for long-running work to get a runId immediately.
- Prefer wait({ runId }) and end the response when the run may take a while; the gateway will notify on completion.
- Use tool_result({ runId }) to check manually without waiting.
- Use tool_watch({ runId }) only for short waits where the result is needed before responding.
- If a synchronous run exceeds the gateway grace period, execute_tool may auto-return a runId and continue in the background.

Examples:
- execute_tool({ tool: "read", args: { filePath: "/path/to/file" } })
- execute_tool({ tool: "apply_patch", args: { patchText: "...", dryRun: true } })
- execute_tool({ tool: "pipeline:transcript", args: { url: "https://youtube.com/..." }, async: true })
- execute_tool({ tool: "skill:skill-name", args: { task: "current user task" } })
- execute_tool({ tool: "mcp:context7_resolve-library-id", args: { libraryName: "React" } })`,
	parameters: [
		{
			name: "tool",
			description:
				'Exact tool name. Use "pipeline:name" for pipelines, "skill:name" for skills, and "mcp:server_tool" for MCP tools. Use find_tools first if unsure.',
			type: "string",
			required: true,
		},
		{
			name: "args",
			description: "Arguments to pass to the tool",
			type: "object",
			required: false,
		},
		{
			name: "async",
			description:
				"If true, execute in the background and return runId immediately. Prefer wait(runId) after starting long-running work.",
			type: "boolean",
			required: false,
		},
	],
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

		// Tab-aware execution check
		if (_tabContext && !_tabContext.isToolAllowed(toolName)) {
			throw new Error(
				`Tool "${toolName}" is not available in the "${_tabContext.activeTab}" tab. Switch to the appropriate tab to use this tool.`,
			);
		}

		// MCP tool execution
		if (toolName.startsWith("mcp:")) {
			if (async) {
				const run = createPendingToolRun(toolName, toolArgs);
				defer(
					() =>
						void executeRunnerAsync(run.runId, toolName, toolArgs, () =>
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

		// Pipeline execution
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

		// Skill activation
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

		// Meta-tool execution through execute_tool for bridge clients that only expose execute_tool.
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
			defer(() => void executeToolAsync(run.runId, toolName, toolArgs));
			return asyncStartResponse(toolName, run);
		}

		if (shouldForceAsync(toolName, toolArgs)) {
			const run = createPendingToolRun(toolName, toolArgs);
			defer(() => void executeToolAsync(run.runId, toolName, toolArgs));
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

export function getToolRunStatus(runId: string): ToolRun | undefined {
	return toolRuns.get(runId);
}

export function getAllToolRuns(): ToolRun[] {
	return Array.from(toolRuns.values());
}

export function clearOldToolRuns(maxAge: number = 3600000): number {
	const now = Date.now();
	let cleared = 0;

	for (const [runId, run] of toolRuns.entries()) {
		if (run.completedAt && now - run.completedAt.getTime() > maxAge) {
			toolRuns.delete(runId);
			cleared++;
		}
	}

	if (cleared > 0) {
		console.log(`[ToolExecution] Cleared ${cleared} old tool runs`);
	}

	return cleared;
}
