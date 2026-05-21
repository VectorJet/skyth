import type {
	CapabilityRunner,
	RunContext,
} from "@/gateway/core/contracts/index.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";

export interface PipelineStartResult {
	runId: string;
}

export interface PipelineRunAndWaitResult {
	runId: string;
	output: any;
	duration?: number;
}

const DEFAULT_POLL_MS = Number(
	process.env.CLAUDE_GATEWAY_PIPELINE_RUNNER_POLL_MS ?? 1000,
);

export class PipelineRunner
	implements CapabilityRunner<Record<string, any>, PipelineRunAndWaitResult>
{
	readonly kind = "pipeline" as const;

	constructor(private registry: PipelineRegistry) {}

	private normalizeName(name: string): string {
		return name.replace(/^pipeline:/, "");
	}

	assertAvailable(name: string): void {
		const pipelineName = this.normalizeName(name);
		if (!this.registry.hasPipeline(pipelineName)) {
			const available = Array.from(this.registry.getAllPipelines().keys());
			throw new Error(
				`Pipeline "${pipelineName}" not found. Available pipelines: ${available.join(", ")}`,
			);
		}
	}

	async start(
		name: string,
		args: Record<string, any> = {},
	): Promise<PipelineStartResult> {
		const pipelineName = name.replace(/^pipeline:/, "");
		this.assertAvailable(pipelineName);
		return { runId: await this.registry.execute(pipelineName, args) };
	}

	async wait(
		runId: string,
		pollMs = DEFAULT_POLL_MS,
	): Promise<PipelineRunAndWaitResult> {
		while (true) {
			const pipelineRun = this.registry.getRunStatus(runId);
			if (!pipelineRun) throw new Error(`Pipeline run "${runId}" not found`);
			if (pipelineRun.status === "completed") {
				return {
					runId,
					output: pipelineRun.output,
					duration: pipelineRun.duration,
				};
			}
			if (pipelineRun.status === "failed")
				throw new Error(`Pipeline execution failed: ${pipelineRun.error}`);
			await new Promise((resolve) => setTimeout(resolve, pollMs));
		}
	}

	async run(
		name: string,
		args: Record<string, any> = {},
		_context?: RunContext,
	): Promise<PipelineRunAndWaitResult> {
		const { runId } = await this.start(name, args);
		return await this.wait(runId);
	}
}
