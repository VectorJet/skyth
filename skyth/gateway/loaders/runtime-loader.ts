import { PipelineLoader } from "@/gateway/loaders/pipelines/pipeline-loader.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import {
	ToolLoader,
	type ToolRegistry,
} from "@/gateway/registries/tools/index.ts";
import type { HookManager } from "@/gateway/hooks/index.ts";
import type { GatewaySourceLayout } from "@/gateway/sources/index.ts";
import type { LoadSource } from "@/gateway/core/contracts/index.ts";

export interface RuntimeLoaderOptions {
	sources: GatewaySourceLayout;
	hooks?: HookManager;
}

export interface RuntimeLoadSummary {
	toolSources: string[];
	pipelineSources: string[];
}

function sourcesFor(
	sources: GatewaySourceLayout,
	capability: "tool" | "pipeline",
): LoadSource[] {
	return [
		...sources.builtin,
		...sources.workspace,
		...sources.temporary,
	].filter((source) => source.capabilities.includes(capability));
}

export class RuntimeLoader {
	constructor(private options: RuntimeLoaderOptions) {}

	async loadToolSource(
		registry: ToolRegistry,
		source: LoadSource,
	): Promise<string> {
		const registrySource = source.kind === "builtin" ? "builtin" : "custom";
		await new ToolLoader(source.root, {
			source,
			hooks: this.options.hooks,
		}).loadAllTools(registry, registrySource);
		return source.label || source.root;
	}

	async loadPipelineSource(
		registry: PipelineRegistry,
		source: LoadSource,
	): Promise<string> {
		await new PipelineLoader(source.root, {
			source,
			hooks: this.options.hooks,
		}).loadAllPipelines(registry);
		return source.label || source.root;
	}

	async loadTools(registry: ToolRegistry): Promise<string[]> {
		const loadedSources: string[] = [];
		for (const source of sourcesFor(this.options.sources, "tool")) {
			loadedSources.push(await this.loadToolSource(registry, source));
		}
		return loadedSources;
	}

	async loadPipelines(registry: PipelineRegistry): Promise<string[]> {
		const loadedSources: string[] = [];
		for (const source of sourcesFor(this.options.sources, "pipeline")) {
			loadedSources.push(await this.loadPipelineSource(registry, source));
		}
		return loadedSources;
	}

	async loadRuntimeCapabilities(input: {
		toolRegistry: ToolRegistry;
		pipelineRegistry: PipelineRegistry;
	}): Promise<RuntimeLoadSummary> {
		const [toolSources, pipelineSources] = await Promise.all([
			this.loadTools(input.toolRegistry),
			this.loadPipelines(input.pipelineRegistry),
		]);
		return { toolSources, pipelineSources };
	}
}
