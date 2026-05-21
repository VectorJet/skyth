import { randomUUID } from "crypto";
import { getRuntime } from "@/gateway/channels/runtime.ts";
import type { ToolRun } from "@/gateway/meta/tools/execution/types.ts";
import { formatCompletedToolResult } from "@/gateway/meta/tools/execution/results.ts";

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

function stringifyForGateway(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export async function notifyToolRunComplete(run: ToolRun): Promise<void> {
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

export function startToolRun(
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

export function createPendingToolRun(
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

export function defer(callback: () => void): void {
	setTimeout(callback, Math.max(0, ASYNC_START_DELAY_MS));
}

export function asyncStartResponse(
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

export async function waitForRunOrAutoAsync(
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

export function getToolRunStatus(runId: string): ToolRun | undefined {
	return toolRuns.get(runId);
}

export function getAllToolRuns(): ToolRun[] {
	return Array.from(toolRuns.values());
}

export function markToolRunWaitRequested(runId: string): ToolRun | undefined {
	const run = toolRuns.get(runId);
	if (!run) return undefined;
	run.notifyOnComplete = true;
	run.waitRequested = true;
	return run;
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
