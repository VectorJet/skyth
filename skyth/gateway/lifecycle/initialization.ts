import { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import {
	SkillLoader,
	SkillRegistry,
} from "@/gateway/registries/skills/index.ts";
import { MetaToolsManager } from "@/gateway/meta/tools/index.ts";
import {
	createDefaultHookManager,
	createGatewayRuntimeServices,
	ensureRuntimeDirectories,
} from "@/gateway/core/runtime/index.ts";
import { createGatewaySourceLayout } from "@/gateway/sources/index.ts";
// import { registerComposioDirectTools } from '@/gateway/integrations/composio-direct-tools.ts';

export async function initializeRegistries() {
	console.log("Initializing registries...");
	const sources = createGatewaySourceLayout();
	const hooks = createDefaultHookManager();

	// Initialize MCP Registry
	const mcpRegistry = new MCPRegistry({
		mcpDirectories: [
			...sources.builtin
				.filter((source) => source.capabilities.includes("mcp"))
				.map((source) => source.root),
			...sources.workspace
				.filter((source) => source.capabilities.includes("mcp"))
				.map((source) => source.root),
			...sources.temporary
				.filter((source) => source.capabilities.includes("mcp"))
				.map((source) => source.root),
		],
		autoReload: true,
	});

	// Initialize Tool Registry
	const toolRegistry = new ToolRegistry({
		validateSchemas: true,
		allowOverride: false,
	});

	// Initialize Pipeline Registry
	const pipelineRegistry = new PipelineRegistry({
		validateSchemas: true,
		allowOverride: false,
	});

	// Initialize Skill Registry
	const skillRegistry = new SkillRegistry(
		new SkillLoader(undefined, { hooks }),
		{
			allowOverride: true,
		},
	);

	const runtimeServices = createGatewayRuntimeServices({
		toolRegistry,
		pipelineRegistry,
		mcpRegistry,
		skillRegistry,
		hooks,
	});
	await ensureRuntimeDirectories(runtimeServices);

	// Initialize Meta-Tools Manager
	const metaToolsManager = new MetaToolsManager(
		toolRegistry,
		pipelineRegistry,
		mcpRegistry,
		skillRegistry,
		runtimeServices.hooks,
		runtimeServices.runners,
	);

	// Wire runners into the meta-tool execute path so prefixed
	// invocations (mcp:, skill:) dispatch through the new runner facades.
	const { setExecuteRunners } = await import("@/gateway/meta/tools/index.ts");
	setExecuteRunners(runtimeServices.runners);

	// Initialize the MCP registry
	await mcpRegistry.initialize();

	// Initialize meta-tools manager (this loads all tools and pipelines internally)
	await metaToolsManager.initialize();

	// Direct Composio app-action promotion is paused while Composio's own meta
	// tools are exposed as gateway meta-tools.
	// try {
	//   await registerComposioDirectTools(toolRegistry, mcpRegistry);
	// } catch (error: any) {
	//   console.warn(`[Composio] Failed to register direct gateway tools: ${error?.message || error}`);
	// }

	// Load skills as a first-class ecosystem parallel to tools and pipelines.
	await skillRegistry.reload();

	const stats = metaToolsManager.getStats();
	console.log(`\n[Gateway] Meta-tools system initialized`);
	console.log(`[Gateway] ${stats.metaTools} meta-tools exposed via MCP`);
	console.log(
		`[Gateway] ${stats.tools.total} tools available internally (${stats.tools.builtin} builtin, ${stats.tools.custom} custom)`,
	);
	console.log(
		`[Gateway] ${stats.pipelines.totalPipelines} pipelines available internally`,
	);
	console.log(
		`[Gateway] ${stats.skills.totalSkills} skills available internally`,
	);
	const watcherStatus = runtimeServices.watchers.status();
	console.log(
		`[Gateway] Runtime architecture services ready ` +
			`(${runtimeServices.sources.all.length} sources, ` +
			`${runtimeServices.hooks.list().length} hooks, ` +
			`${watcherStatus.watchedSources.length} watched roots, ` +
			`runners active)`,
	);

	return {
		mcpRegistry,
		toolRegistry,
		pipelineRegistry,
		skillRegistry,
		metaToolsManager,
		runtimeServices,
	};
}
