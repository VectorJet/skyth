import * as fs from "fs/promises";
import * as path from "path";
import type { LoadSource } from "@/gateway/core/contracts/index.ts";
import type { HookManager } from "@/gateway/hooks/index.ts";
import { PipelineLoader } from "@/gateway/loaders/pipelines/pipeline-loader.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import {
	ToolLoader,
	type ToolRegistry,
} from "@/gateway/registries/tools/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";
import type { WatcherManager, WatchEvent } from "@/gateway/watchers/index.ts";
import { fingerprintDirectory } from "@/gateway/meta/tools/manager/fingerprint.ts";

interface RuntimeHotReloadOptions {
	toolRegistry: ToolRegistry;
	pipelineRegistry: PipelineRegistry;
	mcpRegistry: MCPRegistry;
	skillRegistry: SkillRegistry;
	sourceLayout: {
		builtin: LoadSource[];
		workspace: LoadSource[];
		temporary: LoadSource[];
	};
	toolLoader: ToolLoader;
	hooks?: HookManager;
}

export class RuntimeHotReloader {
	private loadedToolDirs = new Map<
		string,
		{ toolName: string; fingerprint: string }
	>();
	private loadedPipelineDirs = new Map<
		string,
		{ pipelineName: string; fingerprint: string }
	>();
	private hotReloadTimer: Timer | null = null;
	private reloadInProgress = false;
	private watcherUnsubscribe?: () => void;

	constructor(private opts: RuntimeHotReloadOptions) {}

	async trackLoadedRuntimeSources(): Promise<void> {
		for (const source of [
			...this.opts.sourceLayout.builtin,
			...this.opts.sourceLayout.workspace,
			...this.opts.sourceLayout.temporary,
		]) {
			if (source.capabilities.includes("tool"))
				await this.trackToolSource(source);
			if (source.capabilities.includes("pipeline"))
				await this.trackPipelineSource(source);
		}
	}

	attachWatcher(watchers: WatcherManager, notify?: () => void): void {
		this.watcherUnsubscribe?.();
		this.watcherUnsubscribe = watchers.subscribe((event) => {
			void this.handleWatchEvent(event, notify);
		});
	}

	startToolHotReload(notify?: () => void): void {
		if (this.hotReloadTimer) return;
		const intervalMs = Math.max(
			250,
			Number(process.env.CLAUDE_GATEWAY_TOOL_RELOAD_MS ?? 1000),
		);
		console.log(
			`[MetaTools] Tool hot reload enabled for ${this.opts.toolLoader.getToolsDirectory?.() ?? "builtin tools"} every ${intervalMs}ms`,
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

	private async trackToolSource(source: LoadSource): Promise<void> {
		const loader = new ToolLoader(source.root, {
			source,
			hooks: this.opts.hooks,
		});
		const scanned = await loader.scanTools();
		for (const [, toolPath] of scanned.entries()) {
			const loaded = await loader.loadTool(toolPath);
			if (!loaded) continue;
			this.loadedToolDirs.set(path.resolve(toolPath), {
				toolName: loaded.tool.name,
				fingerprint: await fingerprintDirectory(toolPath),
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
					fingerprint: await fingerprintDirectory(dir),
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
			const scanned = await this.opts.toolLoader.scanTools();
			const seenDirs = new Set<string>();
			let changed = false;
			for (const [, toolPath] of scanned.entries()) {
				const dir = path.resolve(toolPath);
				seenDirs.add(dir);
				const fingerprint = await fingerprintDirectory(dir);
				const existing = this.loadedToolDirs.get(dir);
				if (existing && existing.fingerprint === fingerprint) continue;
				if (existing) this.opts.toolRegistry.unregister(existing.toolName);
				const loaded = await this.opts.toolLoader.loadTool(toolPath);
				if (!loaded) {
					this.loadedToolDirs.delete(dir);
					changed = true;
					continue;
				}
				if (!existing && this.opts.toolRegistry.hasTool(loaded.tool.name)) {
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
					this.opts.toolRegistry.register(loaded.tool, "builtin");
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
				this.opts.toolLoader.getToolsDirectory?.() || "src/builtin/tools",
			);
			for (const [dir, loaded] of Array.from(this.loadedToolDirs.entries())) {
				if (!dir.startsWith(sourceRoot) || seenDirs.has(dir)) continue;
				this.opts.toolRegistry.unregister(loaded.toolName);
				this.loadedToolDirs.delete(dir);
				changed = true;
				console.log(`[MetaTools] Hot removed tool: ${loaded.toolName}`);
			}
			if (!opts.initial && changed) opts.notify?.();
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
			const loader = new ToolLoader(source.root, {
				source,
				hooks: this.opts.hooks,
			});
			const scanned = await loader.scanTools();
			const seenDirs = new Set<string>();
			let changed = false;
			for (const [, toolPath] of scanned.entries()) {
				const dir = path.resolve(toolPath);
				seenDirs.add(dir);
				const fingerprint = await fingerprintDirectory(dir);
				const existing = this.loadedToolDirs.get(dir);
				if (existing && existing.fingerprint === fingerprint) continue;
				if (existing) this.opts.toolRegistry.unregister(existing.toolName);
				const loaded = await loader.loadTool(toolPath);
				if (!loaded) {
					this.loadedToolDirs.delete(dir);
					changed = true;
					continue;
				}
				if (this.opts.toolRegistry.hasTool(loaded.tool.name))
					this.opts.toolRegistry.unregister(loaded.tool.name);
				this.opts.toolRegistry.register(
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
				if (!dir.startsWith(path.resolve(source.root)) || seenDirs.has(dir))
					continue;
				this.opts.toolRegistry.unregister(loaded.toolName);
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
			hooks: this.opts.hooks,
		});
		let changed = false;
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const dir = path.resolve(path.join(source.root, entry.name));
			seenDirs.add(dir);
			const fingerprint = await fingerprintDirectory(dir);
			const existing = this.loadedPipelineDirs.get(dir);
			if (existing && existing.fingerprint === fingerprint) continue;
			let manifestName = entry.name;
			try {
				const manifest = JSON.parse(
					await fs.readFile(path.join(dir, "manifest.json"), "utf8"),
				);
				manifestName = String(manifest.name || entry.name);
			} catch {}
			if (existing)
				this.opts.pipelineRegistry.unregister(existing.pipelineName);
			if (!existing && this.opts.pipelineRegistry.hasPipeline(manifestName))
				this.opts.pipelineRegistry.unregister(manifestName);
			await loader.loadPipeline(entry.name, this.opts.pipelineRegistry);
			if (this.opts.pipelineRegistry.hasPipeline(manifestName)) {
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
			if (!dir.startsWith(path.resolve(source.root)) || seenDirs.has(dir))
				continue;
			this.opts.pipelineRegistry.unregister(loaded.pipelineName);
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
			if (event.kind === "tool" && event.source)
				await this.reloadToolSource(event.source, notify);
			else if (event.kind === "pipeline" && event.source)
				await this.reloadPipelineSource(event.source, notify);
			else if (event.kind === "skill") {
				await this.opts.skillRegistry.reload();
				notify?.();
			} else if (event.kind === "mcp" && event.name) {
				await this.opts.mcpRegistry.reloadServer(event.name);
				notify?.();
			}
		} catch (error: any) {
			console.error(
				`[MetaTools] Hot reload failed for ${event.kind}:${event.name || ""}: ${error?.message || error}`,
			);
		}
	}
}
