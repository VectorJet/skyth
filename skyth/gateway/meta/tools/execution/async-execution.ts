import type { ExecuteToolRunners } from "@/gateway/meta/tools/execution/types.ts";
import {
	getToolRunStatus,
	notifyToolRunComplete,
} from "@/gateway/meta/tools/execution/runs.ts";

export type RequireRunners = () => ExecuteToolRunners;

export function shouldForceAsync(
	toolName: string,
	toolArgs: Record<string, any>,
): boolean {
	const configured = (process.env.CLAUDE_GATEWAY_TOOL_FORCE_ASYNC ?? "")
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	if (configured.includes(toolName)) return true;

	return (
		toolName === "memory_embed" ||
		(toolName === "memory_import" &&
			(toolArgs.mode === "reindex" || typeof toolArgs.filePath === "string"))
	);
}

export async function executeToolAsync(
	runId: string,
	toolName: string,
	args: Record<string, any>,
	requireRunners: RequireRunners,
): Promise<void> {
	const run = getToolRunStatus(runId);
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

export async function executeRunnerAsync(
	runId: string,
	toolName: string,
	executor: () => Promise<any>,
): Promise<void> {
	const run = getToolRunStatus(runId);
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
