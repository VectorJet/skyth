import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";
import { ToolLoader } from "@/gateway/registries/tools/index.ts";
import * as fs from "fs/promises";
import * as path from "path";
import { pathToFileURL } from "url";
import { createHash } from "crypto";
import { createGatewaySourceLayout } from "@/gateway/sources/index.ts";
import type { HookManager } from "@/gateway/hooks/index.ts";
import { RuntimeLoader } from "@/gateway/loaders/index.ts";
import type { ExecuteToolRunners } from "@/gateway/meta/tools/execute_tool.ts";
import type { WatcherManager } from "@/gateway/watchers/index.ts";
import {
	setComposioMetaMcpRegistry,
	setExecuteMcpRegistry,
	setExecutePipelineRegistry,
	setExecuteSkillRegistry,
	setExecuteToolRegistry,
	setFindToolsMcpRegistry,
	setFindToolsPipelineRegistry,
	setFindToolsRunners,
	setFindToolsSkillRegistry,
	setFindToolsToolRegistry,
	setListToolsMcpRegistry,
	setListToolsPipelineRegistry,
	setListToolsSkillRegistry,
	setListToolsToolRegistry,
	setMetaSkillRegistry,
} from "@/gateway/meta/tools/index.ts";
import {
	executeMetaToolForModules,
	getMetaToolsForModules,
} from "@/gateway/meta/tools/manager/exposure.ts";
import type { MetaToolModules } from "@/gateway/meta/tools/manager/modules.ts";
import { fingerprintDirectory } from "@/gateway/meta/tools/manager/fingerprint.ts";
import { registerLegacyPipelineTools } from "@/gateway/meta/tools/manager/legacy-pipelines.ts";
import { startMetaReloadTimer } from "@/gateway/meta/tools/manager/meta-reload-timer.ts";
import { RuntimeHotReloader } from "@/gateway/meta/tools/manager/runtime-reload.ts";
import {
	createDefaultTabProfiles,
	isToolAllowedByProfile,
	tabProfilesToRecord,
	type TabProfile,
	updateTabProfileEntry,
} from "@/gateway/meta/tools/manager/tabs.ts";

export type { TabProfile };

export class MetaToolsManager {
	private toolRegistry: ToolRegistry;
	private pipelineRegistry: PipelineRegistry;
	private mcpRegistry: MCPRegistry;
	private skillRegistry: SkillRegistry;
	private initialized: boolean = false;
	private sourceLayout = createGatewaySourceLayout();
	private toolLoader: ToolLoader;
	private runtimeLoader: RuntimeLoader;
	private runtimeHotReloader: RuntimeHotReloader;
	private metaHotReloadTimer: Timer | null = null;
	private metaFingerprint: string = "";
	private metaModules: MetaToolModules | null = null;
	private activeTab: string = "chat";
	private tabProfiles: Map<string, TabProfile> = new Map();

	constructor(
		toolRegistry: ToolRegistry,
		pipelineRegistry: PipelineRegistry,
		mcpRegistry: MCPRegistry,
		skillRegistry: SkillRegistry,
		private hooks?: HookManager,
		private runners?: ExecuteToolRunners,
	) {
		this.toolRegistry = toolRegistry;
		this.pipelineRegistry = pipelineRegistry;
		this.mcpRegistry = mcpRegistry;
		this.skillRegistry = skillRegistry;
		const builtinToolsSource = this.sourceLayout.builtin.find((source) =>
			source.capabilities.includes("tool"),
		);
		this.toolLoader = new ToolLoader("src/builtin/tools", {
			source: builtinToolsSource,
			hooks,
		});
		this.runtimeLoader = new RuntimeLoader({
			sources: this.sourceLayout,
			hooks,
		});
		this.runtimeHotReloader = new RuntimeHotReloader({
			toolRegistry,
			pipelineRegistry,
			mcpRegistry,
			skillRegistry,
			sourceLayout: this.sourceLayout,
			toolLoader: this.toolLoader,
			hooks,
		});

		this.tabProfiles = createDefaultTabProfiles();
	}

	async initialize(): Promise<void> {
		if (this.initialized) {
			console.log("[MetaTools] Already initialized");
			return;
		}

		console.log("[MetaTools] Initializing meta-tools system...");
		await this.reloadMetaToolModules({ force: true });

		console.log("[MetaTools] Loading runtime capabilities...");
		await this.runtimeLoader.loadRuntimeCapabilities({
			toolRegistry: this.toolRegistry,
			pipelineRegistry: this.pipelineRegistry,
		});
		await this.runtimeHotReloader.trackLoadedRuntimeSources();

		console.log("[MetaTools] Registering legacy pipeline tools...");
		await registerLegacyPipelineTools(this.toolRegistry, this.pipelineRegistry);

		console.log("[MetaTools] Configuring meta-tools...");
		setFindToolsToolRegistry(this.toolRegistry);
		setFindToolsPipelineRegistry(this.pipelineRegistry);
		setFindToolsMcpRegistry(this.mcpRegistry);
		setFindToolsSkillRegistry(this.skillRegistry);
		setListToolsToolRegistry(this.toolRegistry);
		setListToolsPipelineRegistry(this.pipelineRegistry);
		setListToolsMcpRegistry(this.mcpRegistry);
		setListToolsSkillRegistry(this.skillRegistry);
		setExecuteToolRegistry(this.toolRegistry);
		setExecutePipelineRegistry(this.pipelineRegistry);
		setExecuteMcpRegistry(this.mcpRegistry);
		setExecuteSkillRegistry(this.skillRegistry);
		if (this.runners) setFindToolsRunners(this.runners);
		setMetaSkillRegistry(this.skillRegistry);
		setComposioMetaMcpRegistry(this.mcpRegistry);

		this.initialized = true;

		const stats = this.toolRegistry.getStats();
		const pipelineStats = this.pipelineRegistry.getStats();
		const skillStats = this.skillRegistry.getStats();

		console.log("[MetaTools] Initialization complete!");
		console.log(
			`[MetaTools] Loaded ${stats.total} tools (${stats.builtin} builtin, ${stats.custom} custom)`,
		);
		console.log(`[MetaTools] Loaded ${pipelineStats.totalPipelines} pipelines`);
		console.log(`[MetaTools] Loaded ${skillStats.totalSkills} skills`);
	}

	private async reloadMetaToolModules(
		opts: { force?: boolean } = {},
	): Promise<boolean> {
		const metaRoot = path.resolve(process.cwd(), "src", "meta", "tools");
		const fingerprint = await fingerprintDirectory(metaRoot);
		if (!opts.force && this.metaModules && fingerprint === this.metaFingerprint)
			return false;
		const importRoot = await this.prepareMetaReloadRoot(
			metaRoot,
			`${fingerprint}-${process.hrtime.bigint()}`,
		);
		this.metaModules = {
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
		};
		this.metaFingerprint = fingerprint;
		this.configureMetaToolModules();
		console.log(
			`[MetaTools] ${opts.force ? "Loaded" : "Hot reloaded"} meta-tool modules`,
		);
		return true;
	}

	private async prepareMetaReloadRoot(
		metaRoot: string,
		cacheKey: string,
	): Promise<string> {
		const targetRoot = path.join(
			process.cwd(),
			"src",
			".gateway-reload-cache",
			"meta-tools",
			createHash("sha256").update(cacheKey).digest("hex"),
		);
		await fs.rm(targetRoot, { recursive: true, force: true });
		await fs.mkdir(targetRoot, { recursive: true });
		await this.copyReloadTree(metaRoot, targetRoot);
		return targetRoot;
	}

	private async copyReloadTree(
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

	private configureMetaToolModules(): void {
		const modules = this.metaModules;
		if (!modules) return;
		modules.find.setToolRegistry(this.toolRegistry);
		modules.find.setPipelineRegistry(this.pipelineRegistry);
		modules.find.setMcpRegistry(this.mcpRegistry);
		modules.find.setSkillRegistry(this.skillRegistry);
		if (this.runners) modules.find.setRunners(this.runners);

		modules.list.setToolRegistry(this.toolRegistry);
		modules.list.setPipelineRegistry(this.pipelineRegistry);
		modules.list.setMcpRegistry(this.mcpRegistry);
		modules.list.setSkillRegistry(this.skillRegistry);

		modules.execute.setToolRegistry(this.toolRegistry);
		modules.execute.setPipelineRegistry(this.pipelineRegistry);
		modules.execute.setMcpRegistry(this.mcpRegistry);
		modules.execute.setSkillRegistry(this.skillRegistry);
		if (this.runners) modules.execute.setExecuteRunners(this.runners);

		modules.composioMeta.setMcpRegistry(this.mcpRegistry);
	}

	attachWatcher(watchers: WatcherManager, notify?: () => void): void {
		this.runtimeHotReloader.attachWatcher(watchers, notify);
	}

	startToolHotReload(notify?: () => void): void {
		this.runtimeHotReloader.startToolHotReload(notify);
	}

	stopToolHotReload(): void {
		this.runtimeHotReloader.stopToolHotReload();
	}

	startMetaHotReload(notify?: () => void): void {
		startMetaReloadTimer(
			this.metaHotReloadTimer,
			() => this.reloadMetaToolModules(),
			(timer) => {
				this.metaHotReloadTimer = timer;
			},
			notify,
		);
	}

	stopMetaHotReload(): void {
		if (!this.metaHotReloadTimer) return;
		clearInterval(this.metaHotReloadTimer);
		this.metaHotReloadTimer = null;
	}

	getMetaTools(): Map<string, any> {
		return getMetaToolsForModules(this.metaModules);
	}

	async executeMetaTool(
		toolName: string,
		args: Record<string, any>,
	): Promise<any> {
		return await executeMetaToolForModules(this.metaModules, toolName, args, {
			activeTab: this.activeTab,
			profile: this.getActiveTabProfile(),
			isToolAllowed: this.isToolAllowed.bind(this),
		});
	}

	getStats() {
		const mcpServers = Array.from(
			this.mcpRegistry.getAllServers().entries(),
		).map(([name, instance]) => ({
			name,
			status: instance.status,
			tools: instance.tools.size,
		}));

		return {
			tools: this.toolRegistry.getStats(),
			pipelines: this.pipelineRegistry.getStats(),
			skills: this.skillRegistry.getStats(),
			metaTools: this.getMetaTools().size,
			mcpServers,
		};
	}

	getRegistries() {
		return {
			toolRegistry: this.toolRegistry,
			pipelineRegistry: this.pipelineRegistry,
			mcpRegistry: this.mcpRegistry,
			skillRegistry: this.skillRegistry,
		};
	}

	setActiveTab(tabName: string): void {
		if (!this.tabProfiles.has(tabName)) {
			throw new Error(
				`Unknown tab: ${tabName}. Available tabs: ${Array.from(this.tabProfiles.keys()).join(", ")}`,
			);
		}
		this.activeTab = tabName;
		console.log(`[MetaTools] Active tab set to: ${tabName}`);
	}

	getActiveTab(): string {
		return this.activeTab;
	}

	getActiveTabProfile(): TabProfile {
		return (
			this.tabProfiles.get(this.activeTab) || this.tabProfiles.get("chat")!
		);
	}

	isToolAllowed(toolName: string): boolean {
		return isToolAllowedByProfile(toolName, this.getActiveTabProfile());
	}

	updateTabProfile(tabName: string, profile: Partial<TabProfile>): void {
		updateTabProfileEntry(this.tabProfiles, tabName, profile);
		console.log(`[MetaTools] Updated profile for tab: ${tabName}`);
	}

	getAllTabProfiles(): Record<string, TabProfile> {
		return tabProfilesToRecord(this.tabProfiles);
	}
}
