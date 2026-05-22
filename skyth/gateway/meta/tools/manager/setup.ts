import * as fs from "fs/promises";
import * as path from "path";
import { pathToFileURL } from "url";
import { createHash } from "crypto";
import { fingerprintDirectory } from "@/gateway/meta/tools/manager/fingerprint";
import { gatewaySourceRoot } from "@/gateway/sources/index.ts";
import type { MetaToolModules } from "@/gateway/meta/tools/manager/modules";
import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";
import type { ExecuteToolRunners } from "@/gateway/meta/tools/execute_tool.ts";

export interface MetaToolModuleState {
	metaModules: MetaToolModules | null;
	metaFingerprint: string;
}

export async function reloadMetaToolModules(
	state: MetaToolModuleState,
	registries: {
		toolRegistry: ToolRegistry;
		pipelineRegistry: PipelineRegistry;
		mcpRegistry: MCPRegistry;
		skillRegistry: SkillRegistry;
		runners?: ExecuteToolRunners;
	},
	opts: { force?: boolean } = {},
): Promise<boolean> {
	const metaRoot = path.join(gatewaySourceRoot(), "meta", "tools");
	const fingerprint = await fingerprintDirectory(metaRoot);
	if (!opts.force && state.metaModules && fingerprint === state.metaFingerprint)
		return false;
	const importRoot = await prepareMetaReloadRoot(
		metaRoot,
		`${fingerprint}-${process.hrtime.bigint()}`,
	);
	state.metaModules = {
		find: await import(
			pathToFileURL(path.join(importRoot, "find_tools.ts")).href
		),
		list: await import(
			pathToFileURL(path.join(importRoot, "list_tools.ts")).href
		),
		execute: await import(
			pathToFileURL(path.join(importRoot, "execute_tool.ts")).href
		),
		toolWatch: await import(
			pathToFileURL(path.join(importRoot, "tool_watch.ts")).href
		),
		wait: await import(
			pathToFileURL(path.join(importRoot, "tool_wait.ts")).href
		),
		toolResult: await import(
			pathToFileURL(path.join(importRoot, "tool_result.ts")).href
		),
		listSkills: await import(
			pathToFileURL(path.join(importRoot, "list_skills.ts")).href
		),
		createSkill: await import(
			pathToFileURL(path.join(importRoot, "create_skill.ts")).href
		),
		useSkill: await import(
			pathToFileURL(path.join(importRoot, "use_skill.ts")).href
		),
		batch: await import(
			pathToFileURL(path.join(importRoot, "batch_tools.ts")).href
		),
		debug: await import(
			pathToFileURL(path.join(importRoot, "gateway_debug.ts")).href
		),
		readme: await import(
			pathToFileURL(path.join(importRoot, "gateway_readme.ts")).href
		),
		composioMeta: await import(
			pathToFileURL(path.join(importRoot, "composio_meta.ts")).href
		),
		delegate: await import(
			pathToFileURL(path.join(importRoot, "delegate_tool.ts")).href
		),
		task: await import(
			pathToFileURL(path.join(importRoot, "task_tool.ts")).href
		),
	};
	state.metaFingerprint = fingerprint;
	configureMetaToolModules(state.metaModules, registries);
	return true;
}

export async function prepareMetaReloadRoot(
	metaRoot: string,
	cacheKey: string,
): Promise<string> {
	const targetRoot = path.join(
		process.cwd(),
		".gateway-reload-cache",
		"meta-tools",
		createHash("sha256").update(cacheKey).digest("hex"),
	);
	await fs.rm(targetRoot, { recursive: true, force: true });
	await fs.mkdir(targetRoot, { recursive: true });
	await copyReloadTree(metaRoot, targetRoot);
	return targetRoot;
}

async function copyReloadTree(
	sourceRoot: string,
	targetRoot: string,
): Promise<void> {
	const walk = async (current: string) => {
		const entries = await fs
			.readdir(current, { withFileTypes: true })
			.catch(() => []);
		for (const entry of entries) {
			if (
				entry.name === "node_modules" ||
				entry.name === ".git" ||
				entry.name === ".gateway-reload"
			)
				continue;
			const sourcePath = path.join(current, entry.name);
			const relativePath = path.relative(sourceRoot, sourcePath);
			const targetPath = path.join(targetRoot, relativePath);
			if (entry.isDirectory()) {
				await fs.mkdir(targetPath, { recursive: true });
				await walk(sourcePath);
			} else if (entry.isFile()) {
				await fs.mkdir(path.dirname(targetPath), { recursive: true });
				await fs.copyFile(sourcePath, targetPath);
			}
		}
	};
	await walk(sourceRoot);
}

export function configureMetaToolModules(
	metaModules: MetaToolModules | null,
	registries: {
		toolRegistry: ToolRegistry;
		pipelineRegistry: PipelineRegistry;
		mcpRegistry: MCPRegistry;
		skillRegistry: SkillRegistry;
		runners?: ExecuteToolRunners;
	},
): void {
	if (!metaModules) return;
	metaModules.find.setToolRegistry(registries.toolRegistry);
	metaModules.find.setPipelineRegistry(registries.pipelineRegistry);
	metaModules.find.setMcpRegistry(registries.mcpRegistry);
	metaModules.find.setSkillRegistry(registries.skillRegistry);
	if (registries.runners) metaModules.find.setRunners(registries.runners);

	metaModules.list.setToolRegistry(registries.toolRegistry);
	metaModules.list.setPipelineRegistry(registries.pipelineRegistry);
	metaModules.list.setMcpRegistry(registries.mcpRegistry);
	metaModules.list.setSkillRegistry(registries.skillRegistry);

	metaModules.execute.setToolRegistry(registries.toolRegistry);
	metaModules.execute.setPipelineRegistry(registries.pipelineRegistry);
	metaModules.execute.setMcpRegistry(registries.mcpRegistry);
	metaModules.execute.setSkillRegistry(registries.skillRegistry);
	if (registries.runners)
		metaModules.execute.setExecuteRunners(registries.runners);

	metaModules.composioMeta.setMcpRegistry(registries.mcpRegistry);
}
