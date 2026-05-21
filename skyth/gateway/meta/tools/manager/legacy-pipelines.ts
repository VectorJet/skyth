import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";

export async function registerLegacyPipelineTools(
	toolRegistry: ToolRegistry,
	pipelineRegistry: PipelineRegistry,
): Promise<void> {
	const { pipelineExecuteTool } = await import(
		"@/gateway/legacy/pipeline-tools/global-tools/execute/index.ts"
	);
	const { pipelineWatchTool } = await import(
		"@/gateway/legacy/pipeline-tools/global-tools/watch/index.ts"
	);
	const { pipelineResultTool } = await import(
		"@/gateway/legacy/pipeline-tools/global-tools/result/index.ts"
	);
	const { pipelineListTool } = await import(
		"@/gateway/legacy/pipeline-tools/global-tools/list/index.ts"
	);
	const { setPipelineRegistry: setExecuteRegistry } = await import(
		"@/gateway/legacy/pipeline-tools/global-tools/execute/index.ts"
	);
	const { setPipelineRegistry: setWatchRegistry } = await import(
		"@/gateway/legacy/pipeline-tools/global-tools/watch/index.ts"
	);
	const { setPipelineRegistry: setResultRegistry } = await import(
		"@/gateway/legacy/pipeline-tools/global-tools/result/index.ts"
	);
	const { setPipelineRegistry: setListRegistry } = await import(
		"@/gateway/legacy/pipeline-tools/global-tools/list/index.ts"
	);

	setExecuteRegistry(pipelineRegistry);
	setWatchRegistry(pipelineRegistry);
	setResultRegistry(pipelineRegistry);
	setListRegistry(pipelineRegistry);

	toolRegistry.register(pipelineExecuteTool, "builtin");
	toolRegistry.register(pipelineWatchTool, "builtin");
	toolRegistry.register(pipelineResultTool, "builtin");
	toolRegistry.register(pipelineListTool, "builtin");
}
