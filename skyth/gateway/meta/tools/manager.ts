import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";
import { ToolLoader } from "@/gateway/registries/tools/index.ts";
import { createGatewaySourceLayout } from "@/gateway/sources/index.ts";
import type { HookManager } from "@/gateway/hooks/index.ts";
import { RuntimeLoader } from "@/gateway/loaders/index.ts";
import type { ExecuteToolRunners } from "@/gateway/meta/tools/execute_tool.ts";
import type { WatcherManager } from "@/gateway/watchers/index.ts";
import {
	setComposioMetaMcpRegistry,
	setDelegateAgentRegistry,
	setDelegateDelegationController,
	setDelegateSubagentManager,
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
import type { DelegationServices } from "@/gateway/meta/tools/delegation_bridge.ts";
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
	reloadMetaToolModules,
	type MetaToolModuleState,
} from "@/gateway/meta/tools/manager/setup.ts";
import {
	createDefaultTabProfiles,
	isToolAllowedByProfile,
	tabProfilesToRecord,
	type TabProfile,
	updateTabProfileEntry,
} from "@/gateway/meta/tools/manager/tabs.ts";

export type { TabProfile };
export type { DelegationServices };

export class MetaToolsManager {
	private toolRegistry: ToolRegistry;
	private pipelineRegistry: PipelineRegistry;
	private mcpRegistry: MCPRegistry;
	private skillRegistry: SkillRegistry;
	private initialized: boolean = false;
	private delegationServices?: DelegationServices;
	private sourceLayout = createGatewaySourceLayout();
	private toolLoader: ToolLoader;
	private runtimeLoader: RuntimeLoader;
	private runtimeHotReloader: RuntimeHotReloader;
	private metaHotReloadTimer: Timer | null = null;
	private metaModuleState: MetaToolModuleState = {
		metaModules: null,
		metaFingerprint: "",
	};
	private activeTab: string = "chat";
	private tabProfiles: Map<string, TabProfile> = new Map();

	constructor(
		toolRegistry: ToolRegistry,
		pipelineRegistry: PipelineRegistry,
		mcpRegistry: MCPRegistry,
		skillRegistry: SkillRegistry,
		private hooks?: HookManager,
		private runners?: ExecuteToolRunners,
		delegationServices?: DelegationServices,
	) {
		this.toolRegistry = toolRegistry;
		this.delegationServices = delegationServices;
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

	get metaModules(): MetaToolModules | null {
		return this.metaModuleState.metaModules;
	}

	async initialize(): Promise<void> {
		if (this.initialized) {
			console.log("[MetaTools] Already initialized");
			return;
		}

		console.log("[MetaTools] Initializing meta-tools system...");
		await this.reloadMetaToolModules({ force: true });

		// Wire delegation bridge services if provided
		if (this.delegationServices) {
			setDelegateSubagentManager(this.delegationServices.subagentManager);
			setDelegateDelegationController(
				this.delegationServices.delegationController,
			);
			setDelegateAgentRegistry(this.delegationServices.agentRegistry);
		}

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
		return reloadMetaToolModules(
			this.metaModuleState,
			{
				toolRegistry: this.toolRegistry,
				pipelineRegistry: this.pipelineRegistry,
				mcpRegistry: this.mcpRegistry,
				skillRegistry: this.skillRegistry,
				runners: this.runners,
			},
			opts,
		);
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
		return getMetaToolsForModules(this.metaModuleState.metaModules);
	}

	async executeMetaTool(
		toolName: string,
		args: Record<string, any>,
	): Promise<any> {
		return await executeMetaToolForModules(
			this.metaModuleState.metaModules,
			toolName,
			args,
			{
				activeTab: this.activeTab,
				profile: this.getActiveTabProfile(),
				isToolAllowed: this.isToolAllowed.bind(this),
			},
		);
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
