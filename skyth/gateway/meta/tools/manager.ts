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
import { PipelineLoader } from "@/gateway/loaders/pipelines/pipeline-loader.ts";
import type { ExecuteToolRunners } from "@/gateway/meta/tools/execute_tool.ts";
import type { LoadSource } from "@/gateway/core/contracts/index.ts";
import type { WatcherManager, WatchEvent } from "@/gateway/watchers/index.ts";
import {
	findToolsTool,
	listToolsTool,
	executeToolTool,
	toolWatchTool,
	waitTool,
	toolResultTool,
	batchToolsTool,
	listSkillsTool,
	createSkillTool,
	useSkillTool,
	gatewayDebugTool,
	gatewayReadmeTool,
	getComposioMetaTools,
	executeComposioMetaTool,
	setComposioMetaMcpRegistry,
	setFindToolsToolRegistry,
	setFindToolsPipelineRegistry,
	setListToolsToolRegistry,
	setListToolsPipelineRegistry,
	setExecuteToolRegistry,
	setExecutePipelineRegistry,
	setFindToolsMcpRegistry,
	setFindToolsSkillRegistry,
	setListToolsMcpRegistry,
	setListToolsSkillRegistry,
	setExecuteMcpRegistry,
	setExecuteSkillRegistry,
	setFindToolsRunners,
	setMetaSkillRegistry,
} from "@/gateway/meta/tools/index.ts";

interface MetaToolModules {
	find: typeof import("@/gateway/meta/tools/find_tools.ts");
	list: typeof import("@/gateway/meta/tools/list_tools.ts");
	execute: typeof import("@/gateway/meta/tools/execute_tool.ts");
	toolWatch: typeof import("@/gateway/meta/tools/tool_watch.ts");
	wait: typeof import("@/gateway/meta/tools/tool_wait.ts");
	toolResult: typeof import("@/gateway/meta/tools/tool_result.ts");
	listSkills: typeof import("@/gateway/meta/tools/list_skills.ts");
	createSkill: typeof import("@/gateway/meta/tools/create_skill.ts");
	useSkill: typeof import("@/gateway/meta/tools/use_skill.ts");
	batch: typeof import("@/gateway/meta/tools/batch_tools.ts");
	debug: typeof import("@/gateway/meta/tools/gateway_debug.ts");
	readme: typeof import("@/gateway/meta/tools/gateway_readme.ts");
	composioMeta: typeof import("@/gateway/meta/tools/composio_meta.ts");
}

export interface TabProfile {
	allowedTools: string[];
	allowedPipelines: string[];
	allowedMcpServers: string[];
	allowedSkills: string[];
}

export class MetaToolsManager {
	private toolRegistry: ToolRegistry;
	private pipelineRegistry: PipelineRegistry;
	private mcpRegistry: MCPRegistry;
	private skillRegistry: SkillRegistry;
	private initialized: boolean = false;
	private sourceLayout = createGatewaySourceLayout();
	private toolLoader: ToolLoader;
	private runtimeLoader: RuntimeLoader;
	private loadedToolDirs: Map<
		string,
		{ toolName: string; fingerprint: string }
	> = new Map();
	private loadedPipelineDirs: Map<
		string,
		{ pipelineName: string; fingerprint: string }
	> = new Map();
	private hotReloadTimer: Timer | null = null;
	private metaHotReloadTimer: Timer | null = null;
	private metaFingerprint: string = "";
	private metaModules: MetaToolModules | null = null;
	private reloadInProgress: boolean = false;
	private watcherUnsubscribe?: () => void;
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

		// Initialize default tab profiles.
		// The chat tab is the user-facing entry point: give it access to every
		// tool, pipeline, and MCP server (`*` wildcard) so Claude can drive the
		// gateway end-to-end from a normal conversation.
		this.tabProfiles.set("chat", {
			allowedTools: ["*"],
			allowedPipelines: ["*"],
			allowedMcpServers: ["*"],
			allowedSkills: ["*"],
		});

		this.tabProfiles.set("code", {
			allowedTools: ["bash", "read", "write", "edit", "glob", "grep"],
			allowedPipelines: ["transcript", "stock_py"],
			allowedMcpServers: ["context7"],
			allowedSkills: ["*"],
		});

		this.tabProfiles.set("cowork", {
			allowedTools: ["bash", "read", "write", "edit", "glob", "grep"],
			allowedPipelines: ["transcript"],
			allowedMcpServers: ["chrome-devtools", "context7"],
			allowedSkills: ["*"],
		});
	}

	/**
	 * Initialize all tools and pipelines
	 * This loads all custom tools, builtin tools, and pipelines into the registries
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			console.log("[MetaTools] Already initialized");
			return;
		}

		console.log("[MetaTools] Initializing meta-tools system...");
		await this.reloadMetaToolModules({ force: true });

		// 1-2. Load tools and pipelines through the runtime loader facade.
		console.log("[MetaTools] Loading runtime capabilities...");
		await this.runtimeLoader.loadRuntimeCapabilities({
			toolRegistry: this.toolRegistry,
			pipelineRegistry: this.pipelineRegistry,
		});
		await this.trackLoadedRuntimeSources();

		// 3. Register old pipeline tools (for backwards compatibility, but they won't be exposed via MCP)
		console.log("[MetaTools] Registering legacy pipeline tools...");
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

		setExecuteRegistry(this.pipelineRegistry);
		setWatchRegistry(this.pipelineRegistry);
		setResultRegistry(this.pipelineRegistry);
		setListRegistry(this.pipelineRegistry);

		this.toolRegistry.register(pipelineExecuteTool, "builtin");
		this.toolRegistry.register(pipelineWatchTool, "builtin");
		this.toolRegistry.register(pipelineResultTool, "builtin");
		this.toolRegistry.register(pipelineListTool, "builtin");

		// 4. Set registries for meta-tools
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
		const fingerprint = await this.fingerprintDirectory(metaRoot);
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

	private async fingerprintDirectory(dir: string): Promise<string> {
		const parts: string[] = [];

		const walk = async (current: string) => {
			let entries: any[] = [];
			try {
				entries = await fs.readdir(current, { withFileTypes: true });
			} catch {
				return;
			}

			for (const entry of entries) {
				const fullPath = path.join(current, entry.name);
				if (entry.isDirectory()) {
					if (
						entry.name === "node_modules" ||
						entry.name === ".git" ||
						entry.name === ".gateway-reload"
					)
						continue;
					await walk(fullPath);
					continue;
				}

				if (!entry.isFile()) continue;
				if (!/\.(ts|js|json|py|toml|txt)$/.test(entry.name)) continue;

				try {
					const stat = await fs.stat(fullPath);
					const hash = createHash("sha256")
						.update(await fs.readFile(fullPath))
						.digest("hex");
					parts.push(
						`${path.relative(dir, fullPath)}:${stat.mtimeMs}:${stat.size}:${hash}`,
					);
				} catch {
					// File may have disappeared mid-scan.
				}
			}
		};

		await walk(dir);
		return parts.sort().join("|");
	}

	private async trackLoadedRuntimeSources(): Promise<void> {
		for (const source of [
			...this.sourceLayout.builtin,
			...this.sourceLayout.workspace,
			...this.sourceLayout.temporary,
		]) {
			if (source.capabilities.includes("tool"))
				await this.trackToolSource(source);
			if (source.capabilities.includes("pipeline"))
				await this.trackPipelineSource(source);
		}
	}

	private async trackToolSource(source: LoadSource): Promise<void> {
		const scanned = await new ToolLoader(source.root, {
			source,
			hooks: this.hooks,
		}).scanTools();
		for (const [, toolPath] of scanned.entries()) {
			const loaded = await new ToolLoader(source.root, {
				source,
				hooks: this.hooks,
			}).loadTool(toolPath);
			if (!loaded) continue;
			this.loadedToolDirs.set(path.resolve(toolPath), {
				toolName: loaded.tool.name,
				fingerprint: await this.fingerprintDirectory(toolPath),
			});
		}
	}

	private async trackPipelineSource(source: LoadSource): Promise<void> {
		let entries: any[] = [];
		try {
			entries = await fs.readdir(source.root, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const dir = path.join(source.root, entry.name);
			try {
				const manifest = JSON.parse(
					await fs.readFile(path.join(dir, "manifest.json"), "utf8"),
				);
				this.loadedPipelineDirs.set(path.resolve(dir), {
					pipelineName: String(manifest.name || entry.name),
					fingerprint: await this.fingerprintDirectory(dir),
				});
			} catch {}
		}
	}

	private async reloadBuiltinTools(
		opts: { initial?: boolean; notify?: () => void } = {},
	): Promise<void> {
		if (this.reloadInProgress) return;
		this.reloadInProgress = true;

		try {
			const scanned = await this.toolLoader.scanTools();
			const seenDirs = new Set<string>();
			let changed = false;

			for (const [, toolPath] of scanned.entries()) {
				const dir = path.resolve(toolPath);
				seenDirs.add(dir);
				const fingerprint = await this.fingerprintDirectory(dir);
				const existing = this.loadedToolDirs.get(dir);

				if (existing && existing.fingerprint === fingerprint) continue;

				if (existing) {
					this.toolRegistry.unregister(existing.toolName);
				}

				const loaded = await this.toolLoader.loadTool(toolPath);
				if (!loaded) {
					this.loadedToolDirs.delete(dir);
					changed = true;
					continue;
				}

				if (!existing && this.toolRegistry.hasTool(loaded.tool.name)) {
					this.loadedToolDirs.set(dir, {
						toolName: loaded.tool.name,
						fingerprint,
					});
					console.log(
						`[MetaTools] Tracking already-loaded tool for hot reload: ${loaded.tool.name}`,
					);
					continue;
				}

				try {
					this.toolRegistry.register(loaded.tool, "builtin");
					this.loadedToolDirs.set(dir, {
						toolName: loaded.tool.name,
						fingerprint,
					});
					changed = true;
					console.log(
						`[MetaTools] ${existing ? "Hot reloaded" : "Loaded"} tool: ${loaded.tool.name}`,
					);
				} catch (error: any) {
					console.error(
						`[MetaTools] Failed to register hot-reloaded tool from ${toolPath}: ${error.message}`,
					);
					this.loadedToolDirs.delete(dir);
					changed = true;
				}
			}

			const sourceRoot = path.resolve(
				this.toolLoader.getToolsDirectory?.() || "src/builtin/tools",
			);
			for (const [dir, loaded] of Array.from(this.loadedToolDirs.entries())) {
				if (!dir.startsWith(sourceRoot)) continue;
				if (seenDirs.has(dir)) continue;
				this.toolRegistry.unregister(loaded.toolName);
				this.loadedToolDirs.delete(dir);
				changed = true;
				console.log(`[MetaTools] Hot removed tool: ${loaded.toolName}`);
			}

			if (!opts.initial && changed) {
				opts.notify?.();
			}
		} finally {
			this.reloadInProgress = false;
		}
	}

	private async reloadToolSource(
		source: LoadSource,
		notify?: () => void,
	): Promise<void> {
		if (this.reloadInProgress) return;
		this.reloadInProgress = true;
		try {
			const loader = new ToolLoader(source.root, { source, hooks: this.hooks });
			const scanned = await loader.scanTools();
			const seenDirs = new Set<string>();
			let changed = false;
			for (const [, toolPath] of scanned.entries()) {
				const dir = path.resolve(toolPath);
				seenDirs.add(dir);
				const fingerprint = await this.fingerprintDirectory(dir);
				const existing = this.loadedToolDirs.get(dir);
				if (existing && existing.fingerprint === fingerprint) continue;
				if (existing) this.toolRegistry.unregister(existing.toolName);
				const loaded = await loader.loadTool(toolPath);
				if (!loaded) {
					this.loadedToolDirs.delete(dir);
					changed = true;
					continue;
				}
				if (this.toolRegistry.hasTool(loaded.tool.name))
					this.toolRegistry.unregister(loaded.tool.name);
				this.toolRegistry.register(
					loaded.tool,
					source.kind === "builtin" ? "builtin" : "custom",
				);
				this.loadedToolDirs.set(dir, {
					toolName: loaded.tool.name,
					fingerprint,
				});
				changed = true;
				console.log(
					`[MetaTools] Hot swapped ${source.kind} tool: ${loaded.tool.name}`,
				);
			}
			for (const [dir, loaded] of Array.from(this.loadedToolDirs.entries())) {
				if (!dir.startsWith(path.resolve(source.root))) continue;
				if (seenDirs.has(dir)) continue;
				this.toolRegistry.unregister(loaded.toolName);
				this.loadedToolDirs.delete(dir);
				changed = true;
				console.log(
					`[MetaTools] Hot removed ${source.kind} tool: ${loaded.toolName}`,
				);
			}
			if (changed) notify?.();
		} finally {
			this.reloadInProgress = false;
		}
	}

	private async reloadPipelineSource(
		source: LoadSource,
		notify?: () => void,
	): Promise<void> {
		let entries: any[] = [];
		try {
			entries = await fs.readdir(source.root, { withFileTypes: true });
		} catch {
			return;
		}
		const seenDirs = new Set<string>();
		const loader = new PipelineLoader(source.root, {
			source,
			hooks: this.hooks,
		});
		let changed = false;
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const dir = path.resolve(path.join(source.root, entry.name));
			seenDirs.add(dir);
			const fingerprint = await this.fingerprintDirectory(dir);
			const existing = this.loadedPipelineDirs.get(dir);
			if (existing && existing.fingerprint === fingerprint) continue;

			let manifestName = entry.name;
			try {
				const manifest = JSON.parse(
					await fs.readFile(path.join(dir, "manifest.json"), "utf8"),
				);
				manifestName = String(manifest.name || entry.name);
			} catch {
				// Loader hooks will reject incomplete candidates; use the directory name for cleanup.
			}

			if (existing) this.pipelineRegistry.unregister(existing.pipelineName);
			if (!existing && this.pipelineRegistry.hasPipeline(manifestName))
				this.pipelineRegistry.unregister(manifestName);

			await loader.loadPipeline(entry.name, this.pipelineRegistry);

			if (this.pipelineRegistry.hasPipeline(manifestName)) {
				this.loadedPipelineDirs.set(dir, {
					pipelineName: manifestName,
					fingerprint,
				});
				console.log(
					`[MetaTools] Hot swapped ${source.kind} pipeline: ${manifestName}`,
				);
			} else {
				this.loadedPipelineDirs.delete(dir);
				console.log(
					`[MetaTools] Hot removed invalid ${source.kind} pipeline candidate: ${manifestName}`,
				);
			}
			changed = true;
		}
		for (const [dir, loaded] of Array.from(this.loadedPipelineDirs.entries())) {
			if (!dir.startsWith(path.resolve(source.root))) continue;
			if (seenDirs.has(dir)) continue;
			this.pipelineRegistry.unregister(loaded.pipelineName);
			this.loadedPipelineDirs.delete(dir);
			changed = true;
			console.log(`[MetaTools] Hot removed pipeline: ${loaded.pipelineName}`);
		}
		if (changed) notify?.();
	}

	private async handleWatchEvent(
		event: WatchEvent,
		notify?: () => void,
	): Promise<void> {
		if (event.type !== "reload.requested") return;
		try {
			if (event.kind === "tool" && event.source) {
				await this.reloadToolSource(event.source, notify);
			} else if (event.kind === "pipeline" && event.source) {
				await this.reloadPipelineSource(event.source, notify);
			} else if (event.kind === "skill") {
				await this.skillRegistry.reload();
				notify?.();
			} else if (event.kind === "mcp" && event.name) {
				await this.mcpRegistry.reloadServer(event.name);
				notify?.();
			}
		} catch (error: any) {
			console.error(
				`[MetaTools] Hot reload failed for ${event.kind}:${event.name || ""}: ${error?.message || error}`,
			);
		}
	}

	attachWatcher(watchers: WatcherManager, notify?: () => void): void {
		this.watcherUnsubscribe?.();
		this.watcherUnsubscribe = watchers.subscribe((event) => {
			void this.handleWatchEvent(event, notify);
		});
	}

	startMetaHotReload(notify?: () => void): void {
		if (this.metaHotReloadTimer) return;
		const intervalMs = Math.max(
			250,
			Number(process.env.CLAUDE_GATEWAY_META_RELOAD_MS ?? 1000),
		);
		console.log(
			`[MetaTools] Meta-tool hot reload enabled for src/meta/tools every ${intervalMs}ms`,
		);
		this.metaHotReloadTimer = setInterval(() => {
			void this.reloadMetaToolModules().then((changed) => {
				if (changed) notify?.();
			});
		}, intervalMs);
	}

	startToolHotReload(notify?: () => void): void {
		if (this.hotReloadTimer) return;
		const intervalMs = Math.max(
			250,
			Number(process.env.CLAUDE_GATEWAY_TOOL_RELOAD_MS ?? 1000),
		);
		console.log(
			`[MetaTools] Tool hot reload enabled for src/builtin/tools every ${intervalMs}ms`,
		);
		this.hotReloadTimer = setInterval(() => {
			void this.reloadBuiltinTools({ notify });
		}, intervalMs);
	}

	stopToolHotReload(): void {
		if (!this.hotReloadTimer) return;
		clearInterval(this.hotReloadTimer);
		this.hotReloadTimer = null;
	}

	stopMetaHotReload(): void {
		if (!this.metaHotReloadTimer) return;
		clearInterval(this.metaHotReloadTimer);
		this.metaHotReloadTimer = null;
	}

	/**
	 * Get only the meta-tools that should be exposed via MCP
	 * These are the ONLY tools Claude will see
	 */
	getMetaTools(): Map<string, any> {
		const metaTools = new Map();
		const modules = this.metaModules;
		const currentFindToolsTool = modules?.find.findToolsTool || findToolsTool;
		const currentListToolsTool = modules?.list.listToolsTool || listToolsTool;
		const currentExecuteToolTool =
			modules?.execute.executeToolTool || executeToolTool;
		const currentToolWatchTool =
			modules?.toolWatch.toolWatchTool || toolWatchTool;
		const currentWaitTool = modules?.wait.waitTool || waitTool;
		const currentToolResultTool =
			modules?.toolResult.toolResultTool || toolResultTool;
		const currentBatchToolsTool =
			modules?.batch.batchToolsTool || batchToolsTool;
		const currentGatewayDebugTool =
			modules?.debug.gatewayDebugTool || gatewayDebugTool;
		const currentGatewayReadmeTool =
			modules?.readme.gatewayReadmeTool || gatewayReadmeTool;
		const currentListSkillsTool =
			modules?.listSkills.listSkillsTool || listSkillsTool;
		const currentCreateSkillTool =
			modules?.createSkill.createSkillTool || createSkillTool;
		const currentUseSkillTool = modules?.useSkill.useSkillTool || useSkillTool;

		// Only expose the gateway meta-tools.
		metaTools.set("find_tools", {
			name: "find_tools",
			description: currentFindToolsTool.description,
			inputSchema: this.convertToInputSchema(currentFindToolsTool),
			source: "meta",
		});

		metaTools.set("list_tools", {
			name: "list_tools",
			description: currentListToolsTool.description,
			inputSchema: this.convertToInputSchema(currentListToolsTool),
			source: "meta",
		});

		metaTools.set("execute_tool", {
			name: "execute_tool",
			description: currentExecuteToolTool.description,
			inputSchema: this.convertToInputSchema(currentExecuteToolTool),
			source: "meta",
		});

		metaTools.set("tool_watch", {
			name: "tool_watch",
			description: currentToolWatchTool.description,
			inputSchema: this.convertToInputSchema(currentToolWatchTool),
			source: "meta",
		});

		metaTools.set("wait", {
			name: "wait",
			description: currentWaitTool.description,
			inputSchema: this.convertToInputSchema(currentWaitTool),
			source: "meta",
		});

		metaTools.set("tool_result", {
			name: "tool_result",
			description: currentToolResultTool.description,
			inputSchema: this.convertToInputSchema(currentToolResultTool),
			source: "meta",
		});

		metaTools.set("batch_tools", {
			name: "batch_tools",
			description: currentBatchToolsTool.description,
			inputSchema: this.convertToInputSchema(currentBatchToolsTool),
			source: "meta",
		});

		metaTools.set("gateway_debug", {
			name: "gateway_debug",
			description: currentGatewayDebugTool.description,
			inputSchema: this.convertToInputSchema(currentGatewayDebugTool),
			source: "meta",
		});

		metaTools.set("gateway_readme", {
			name: "gateway_readme",
			description: currentGatewayReadmeTool.description,
			inputSchema: this.convertToInputSchema(currentGatewayReadmeTool),
			source: "meta",
		});

		metaTools.set("list_skills", {
			name: "list_skills",
			description: currentListSkillsTool.description,
			inputSchema: this.convertToInputSchema(currentListSkillsTool),
			source: "meta",
		});

		metaTools.set("create_skill", {
			name: "create_skill",
			description: currentCreateSkillTool.description,
			inputSchema: this.convertToInputSchema(currentCreateSkillTool),
			source: "meta",
		});

		metaTools.set("use_skill", {
			name: "use_skill",
			description: currentUseSkillTool.description,
			inputSchema: this.convertToInputSchema(currentUseSkillTool),
			source: "meta",
		});

		const composioMetaTools =
			modules?.composioMeta.getComposioMetaTools() || getComposioMetaTools();
		for (const [name, tool] of composioMetaTools.entries()) {
			metaTools.set(name, tool);
		}

		return metaTools;
	}

	/**
	 * Execute a meta-tool
	 */
	async executeMetaTool(
		toolName: string,
		args: Record<string, any>,
	): Promise<any> {
		const modules = this.metaModules;
		const metaToolHandlers: Record<string, any> = {
			find_tools: (modules?.find.findToolsTool || findToolsTool).handler,
			list_tools: (modules?.list.listToolsTool || listToolsTool).handler,
			execute_tool: (modules?.execute.executeToolTool || executeToolTool)
				.handler,
			tool_watch: (modules?.toolWatch.toolWatchTool || toolWatchTool).handler,
			wait: (modules?.wait.waitTool || waitTool).handler,
			tool_result: (modules?.toolResult.toolResultTool || toolResultTool)
				.handler,
			batch_tools: (modules?.batch.batchToolsTool || batchToolsTool).handler,
			gateway_debug: (modules?.debug.gatewayDebugTool || gatewayDebugTool)
				.handler,
			gateway_readme: (modules?.readme.gatewayReadmeTool || gatewayReadmeTool)
				.handler,
			list_skills: (modules?.listSkills.listSkillsTool || listSkillsTool)
				.handler,
			create_skill: (modules?.createSkill.createSkillTool || createSkillTool)
				.handler,
			use_skill: (modules?.useSkill.useSkillTool || useSkillTool).handler,
		};

		const handler = metaToolHandlers[toolName];
		if (
			!handler &&
			(
				modules?.composioMeta.getComposioMetaTools() || getComposioMetaTools()
			).has(toolName)
		) {
			return await (
				modules?.composioMeta.executeComposioMetaTool || executeComposioMetaTool
			)(toolName, args);
		}
		if (!handler) {
			throw new Error(`Meta-tool "${toolName}" not found`);
		}

		// Inject tab context into args for filtering
		const contextualArgs = {
			...args,
			_tabContext: {
				activeTab: this.activeTab,
				profile: this.getActiveTabProfile(),
				isToolAllowed: this.isToolAllowed.bind(this),
			},
		};

		return await handler(contextualArgs);
	}

	/**
	 * Convert tool definition to MCP inputSchema format
	 */
	private convertToInputSchema(tool: any): any {
		const inputSchema: any = {
			type: "object",
			properties: {},
			required: [],
		};

		for (const param of tool.parameters) {
			inputSchema.properties[param.name] = {
				type: param.type,
				description: param.description,
			};

			if (param.enum) {
				inputSchema.properties[param.name].enum = param.enum;
			}

			if (param.properties) {
				inputSchema.properties[param.name].properties = param.properties;
			}

			if (param.items) {
				inputSchema.properties[param.name].items = param.items;
			}

			if (param.required) {
				inputSchema.required.push(param.name);
			}
		}

		return inputSchema;
	}

	/**
	 * Get statistics about the tool system
	 */
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

	/**
	 * Set the active tab context
	 */
	setActiveTab(tabName: string): void {
		if (!this.tabProfiles.has(tabName)) {
			throw new Error(
				`Unknown tab: ${tabName}. Available tabs: ${Array.from(this.tabProfiles.keys()).join(", ")}`,
			);
		}
		this.activeTab = tabName;
		console.log(`[MetaTools] Active tab set to: ${tabName}`);
	}

	/**
	 * Get the current active tab
	 */
	getActiveTab(): string {
		return this.activeTab;
	}

	/**
	 * Get the profile for the active tab
	 */
	getActiveTabProfile(): TabProfile {
		return (
			this.tabProfiles.get(this.activeTab) || this.tabProfiles.get("chat")!
		);
	}

	/**
	 * Check if a tool is allowed in the current tab
	 */
	isToolAllowed(toolName: string): boolean {
		if (typeof toolName !== "string" || toolName.trim() === "") return false;
		const profile = this.getActiveTabProfile();

		// Check if it's a pipeline
		if (toolName.startsWith("pipeline:")) {
			const pipelineName = toolName.replace("pipeline:", "");
			return (
				profile.allowedPipelines.includes("*") ||
				profile.allowedPipelines.includes(pipelineName)
			);
		}

		// Check if it's an MCP tool
		if (toolName.startsWith("mcp:")) {
			const mcpToolName = toolName.replace("mcp:", "");
			// Extract server name from tool name (format: servername_toolname)
			const serverName = mcpToolName.split("_")[0] ?? "";
			return (
				profile.allowedMcpServers.includes("*") ||
				profile.allowedMcpServers.includes(serverName)
			);
		}

		// Check if it's a skill
		if (toolName.startsWith("skill:")) {
			const skillName = toolName.replace("skill:", "");
			return (
				profile.allowedSkills.includes("*") ||
				profile.allowedSkills.includes(skillName)
			);
		}

		// Check if it's a builtin/custom tool
		return (
			profile.allowedTools.includes("*") ||
			profile.allowedTools.includes(toolName)
		);
	}

	/**
	 * Update a tab profile
	 */
	updateTabProfile(tabName: string, profile: Partial<TabProfile>): void {
		const existing = this.tabProfiles.get(tabName) || {
			allowedTools: [],
			allowedPipelines: [],
			allowedMcpServers: [],
			allowedSkills: [],
		};

		this.tabProfiles.set(tabName, {
			allowedTools: profile.allowedTools ?? existing.allowedTools,
			allowedPipelines: profile.allowedPipelines ?? existing.allowedPipelines,
			allowedMcpServers:
				profile.allowedMcpServers ?? existing.allowedMcpServers,
			allowedSkills: profile.allowedSkills ?? existing.allowedSkills,
		});

		console.log(`[MetaTools] Updated profile for tab: ${tabName}`);
	}

	/**
	 * Get all tab profiles
	 */
	getAllTabProfiles(): Record<string, TabProfile> {
		const profiles: Record<string, TabProfile> = {};
		for (const [tabName, profile] of this.tabProfiles.entries()) {
			profiles[tabName] = profile;
		}
		return profiles;
	}
}
