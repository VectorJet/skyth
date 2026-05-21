import type { HookManager } from "@/gateway/hooks/index.ts";
import type { LoadSource } from "@/gateway/core/contracts/index.ts";
import type { PipelineLoader } from "@/gateway/loaders/pipelines/pipeline-loader.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";

export interface PipelineSourceLoaderOptions {
	source?: LoadSource;
	hooks?: HookManager;
}

export class PipelineSourceLoader {
	constructor(
		private loader: PipelineLoader,
		private options: PipelineSourceLoaderOptions = {},
	) {}

	async loadAll(registry: PipelineRegistry): Promise<void> {
		await this.loader.loadAllPipelines(registry);
	}
}
