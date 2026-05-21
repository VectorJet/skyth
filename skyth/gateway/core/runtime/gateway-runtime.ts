import * as fs from "fs/promises";
import {
	createGatewaySourceLayout,
	type GatewaySourceLayout,
} from "@/gateway/sources/index.ts";
import {
	auditHook,
	axMetadataHook,
	HookManager,
	localPolicyHook,
	manifestExistsHook,
	manifestSchemaHook,
	permissionSecurityHook,
	smokeTestHook,
	sourcePolicyHook,
	standardsHook,
} from "@/gateway/hooks/index.ts";
import {
	AgentRunner,
	McpRunner,
	PipelineRunner,
	SkillRunner,
	ToolRunner,
} from "@/gateway/runners/index.ts";
import { WatcherManager } from "@/gateway/watchers/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";

export interface GatewayRuntimeServices {
	sources: GatewaySourceLayout;
	hooks: HookManager;
	watchers: WatcherManager;
	runners: {
		tools: ToolRunner;
		pipelines: PipelineRunner;
		skills: SkillRunner;
		mcp: McpRunner;
		agents: AgentRunner;
	};
}

export interface GatewayRuntimeInput {
	toolRegistry: ToolRegistry;
	pipelineRegistry: PipelineRegistry;
	mcpRegistry: MCPRegistry;
	skillRegistry: SkillRegistry;
	hooks?: HookManager;
}

export function createDefaultHookManager(): HookManager {
	const hooks = new HookManager({ enforce: true });
	hooks.register(manifestExistsHook);
	hooks.register(standardsHook);
	hooks.register(manifestSchemaHook);
	hooks.register(axMetadataHook);
	hooks.register(sourcePolicyHook);
	hooks.register(permissionSecurityHook);
	hooks.register(localPolicyHook);
	hooks.register(smokeTestHook);
	hooks.register(auditHook);
	return hooks;
}

export function createGatewayRuntimeServices(
	input: GatewayRuntimeInput,
): GatewayRuntimeServices {
	const sources = createGatewaySourceLayout();
	const hooks = input.hooks || createDefaultHookManager();

	const watchers = new WatcherManager({
		watchBuiltin: process.env.NODE_ENV !== "production",
	});
	const watchSources =
		process.env.NODE_ENV === "production"
			? [...sources.workspace, ...sources.temporary]
			: [...sources.builtin, ...sources.workspace, ...sources.temporary];
	for (const source of watchSources) {
		watchers.watch(source);
	}

	return {
		sources,
		hooks,
		watchers,
		runners: {
			tools: new ToolRunner(input.toolRegistry),
			pipelines: new PipelineRunner(input.pipelineRegistry),
			skills: new SkillRunner(input.skillRegistry),
			mcp: new McpRunner(input.mcpRegistry),
			agents: new AgentRunner(),
		},
	};
}

/**
 * Ensure workspace + temporary capability directories exist on disk so that
 * agents can drop generated capabilities into a known location without the
 * gateway crashing on first access. Builtin sources are not provisioned: they
 * are part of the repository and managed by the loader facades.
 */
export async function ensureRuntimeDirectories(
	services: GatewayRuntimeServices,
): Promise<void> {
	const targets = [
		...services.sources.workspace,
		...services.sources.temporary,
	];
	await Promise.all(
		targets.map((source) =>
			fs.mkdir(source.root, { recursive: true }).catch((error) => {
				console.warn(
					`[runtime] failed to ensure ${source.label || source.root}: ${error?.message || error}`,
				);
			}),
		),
	);
	services.watchers.start();
}
