import type {
	PipelineDefinition,
	PipelineRun,
	PipelineRegistryOptions,
	RegisteredPipeline,
} from "@/gateway/registries/pipelines/types.ts";
import { randomUUID } from "crypto";

export class PipelineRegistry {
	private pipelines: Map<string, RegisteredPipeline> = new Map();
	private runs: Map<string, PipelineRun> = new Map();
	private options: PipelineRegistryOptions;

	constructor(options: PipelineRegistryOptions = {}) {
		this.options = {
			validateSchemas: options.validateSchemas ?? true,
			allowOverride: options.allowOverride ?? false,
		};
	}

	/**
	 * Register a pipeline
	 */
	register(definition: PipelineDefinition, source: string): void {
		if (!definition.name || !definition.description || !definition.handler) {
			throw new Error("Pipeline must have name, description, and handler");
		}

		if (this.pipelines.has(definition.name) && !this.options.allowOverride) {
			throw new Error(`Pipeline "${definition.name}" is already registered`);
		}

		this.pipelines.set(definition.name, {
			definition,
			registeredAt: new Date(),
			source,
		});

		console.log(
			`[PipelineRegistry] Registered pipeline: ${definition.name} (source: ${source})`,
		);
	}

	/**
	 * Unregister a pipeline
	 */
	unregister(name: string): boolean {
		const deleted = this.pipelines.delete(name);
		if (deleted) {
			console.log(`[PipelineRegistry] Unregistered pipeline: ${name}`);
		}
		return deleted;
	}

	/**
	 * Get a pipeline by name
	 */
	getPipeline(name: string): RegisteredPipeline | undefined {
		return this.pipelines.get(name);
	}

	/**
	 * Check if a pipeline exists
	 */
	hasPipeline(name: string): boolean {
		return this.pipelines.has(name);
	}

	/**
	 * Get all registered pipelines
	 */
	getAllPipelines(): Map<string, RegisteredPipeline> {
		return new Map(this.pipelines);
	}

	/**
	 * Execute a pipeline asynchronously and return a run ID
	 */
	async execute(
		pipelineName: string,
		input: Record<string, any>,
	): Promise<string> {
		const pipeline = this.pipelines.get(pipelineName);
		if (!pipeline) {
			throw new Error(`Pipeline "${pipelineName}" not found`);
		}

		const runId = randomUUID();
		const run: PipelineRun = {
			runId,
			pipelineName,
			status: "pending",
			input,
			startedAt: new Date(),
		};

		this.runs.set(runId, run);
		console.log(
			`[PipelineRegistry] Created run ${runId} for pipeline ${pipelineName}`,
		);

		// Execute pipeline asynchronously
		this.executeAsync(runId, pipeline.definition, input);

		return runId;
	}

	/**
	 * Execute pipeline in background
	 */
	private async executeAsync(
		runId: string,
		definition: PipelineDefinition,
		input: Record<string, any>,
	): Promise<void> {
		const run = this.runs.get(runId);
		if (!run) return;

		try {
			run.status = "running";
			console.log(`[PipelineRegistry] Starting execution of run ${runId}`);

			const result = await definition.handler(input);

			run.status = "completed";
			run.output = result;
			run.completedAt = new Date();
			run.duration = run.completedAt.getTime() - run.startedAt.getTime();

			console.log(
				`[PipelineRegistry] Run ${runId} completed in ${run.duration}ms`,
			);
		} catch (error: any) {
			run.status = "failed";
			run.error = error.message || "Unknown error";
			run.completedAt = new Date();
			run.duration = run.completedAt.getTime() - run.startedAt.getTime();

			console.error(`[PipelineRegistry] Run ${runId} failed: ${run.error}`);
		}
	}

	/**
	 * Get the status of a pipeline run
	 */
	getRunStatus(runId: string): PipelineRun | undefined {
		return this.runs.get(runId);
	}

	/**
	 * Get the result of a completed pipeline run
	 */
	getRunResult(runId: string): any {
		const run = this.runs.get(runId);
		if (!run) {
			throw new Error(`Run "${runId}" not found`);
		}

		if (run.status === "pending" || run.status === "running") {
			throw new Error(`Run "${runId}" is still ${run.status}`);
		}

		if (run.status === "failed") {
			throw new Error(`Run "${runId}" failed: ${run.error}`);
		}

		return run.output;
	}

	/**
	 * Get all runs
	 */
	getAllRuns(): Map<string, PipelineRun> {
		return new Map(this.runs);
	}

	/**
	 * Get statistics about the registry
	 */
	getStats() {
		return {
			totalPipelines: this.pipelines.size,
			totalRuns: this.runs.size,
			runsByStatus: {
				pending: Array.from(this.runs.values()).filter(
					(r) => r.status === "pending",
				).length,
				running: Array.from(this.runs.values()).filter(
					(r) => r.status === "running",
				).length,
				completed: Array.from(this.runs.values()).filter(
					(r) => r.status === "completed",
				).length,
				failed: Array.from(this.runs.values()).filter(
					(r) => r.status === "failed",
				).length,
			},
		};
	}

	/**
	 * Clear old completed/failed runs
	 */
	clearOldRuns(maxAge: number = 3600000): number {
		const now = Date.now();
		let cleared = 0;

		for (const [runId, run] of this.runs.entries()) {
			if (run.completedAt && now - run.completedAt.getTime() > maxAge) {
				this.runs.delete(runId);
				cleared++;
			}
		}

		if (cleared > 0) {
			console.log(`[PipelineRegistry] Cleared ${cleared} old runs`);
		}

		return cleared;
	}
}
