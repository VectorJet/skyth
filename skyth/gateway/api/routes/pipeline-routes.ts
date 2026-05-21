import type { Hono } from "hono";
import type { MetaToolsManager } from "@/gateway/meta/tools/index.ts";

export function registerPipelineRoutes(
	app: Hono,
	metaToolsManager: MetaToolsManager,
) {
	// List all pipelines
	app.get("/pipelines", (c) => {
		const { pipelineRegistry } = metaToolsManager.getRegistries();
		const pipelines = Array.from(
			pipelineRegistry.getAllPipelines().entries(),
		).map(([name, registered]) => ({
			name,
			description: registered.definition.description,
			parameters: registered.definition.parameters,
			metadata: registered.definition.metadata,
			source: registered.source,
			registeredAt: registered.registeredAt,
		}));

		return c.json({
			count: pipelines.length,
			pipelines,
		});
	});

	// Execute a pipeline
	app.post("/pipelines/:name/execute", async (c) => {
		const name = c.req.param("name");

		try {
			const body = await c.req.json();
			const input = body.input || body;

			console.log(`Executing pipeline: ${name} with input:`, input);

			const execution = await metaToolsManager.executeMetaTool("execute_tool", {
				tool: `pipeline:${name}`,
				args: input,
				async: true,
			});

			return c.json({
				success: true,
				pipeline: name,
				runId: execution.pipelineRunId || execution.runId,
				toolRunId: execution.runId,
				pipelineRunId: execution.pipelineRunId,
				message: `Pipeline execution started. Use /pipelines/runs/${execution.pipelineRunId || execution.runId} to check status.`,
			});
		} catch (error: any) {
			console.error(`Error executing pipeline ${name}:`, error);

			return c.json(
				{
					success: false,
					pipeline: name,
					error: error.message || "Unknown error",
				},
				500,
			);
		}
	});

	// Get pipeline run status
	app.get("/pipelines/runs/:runId", (c) => {
		const runId = c.req.param("runId");

		try {
			const { pipelineRegistry } = metaToolsManager.getRegistries();
			const run = pipelineRegistry.getRunStatus(runId);

			if (!run) {
				return c.json(
					{
						success: false,
						error: `Run "${runId}" not found`,
					},
					404,
				);
			}

			return c.json({
				success: true,
				run,
			});
		} catch (error: any) {
			return c.json(
				{
					success: false,
					error: error.message || "Unknown error",
				},
				500,
			);
		}
	});

	// Get all pipeline runs
	app.get("/pipelines/runs", (c) => {
		const { pipelineRegistry } = metaToolsManager.getRegistries();
		const runs = Array.from(pipelineRegistry.getAllRuns().values());
		const stats = pipelineRegistry.getStats();

		return c.json({
			count: runs.length,
			stats,
			runs,
		});
	});
}
