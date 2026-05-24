import type { InboundMessage } from "@/base/base_agent/bus/events";
import type {
	ModelHookContext,
	Plugin,
	PluginContext,
	SessionHookContext,
	ToolHookContext,
	ToolInterceptResult,
} from "@/base/base_agent/plugin/types";

export interface PluginManagerOptions {
	onWarning?: (message: string, details?: Record<string, unknown>) => void;
}

export class PluginManager {
	private readonly plugins: Plugin[] = [];
	private pluginMap = new Map<string, Plugin>();

	constructor(private readonly options: PluginManagerOptions = {}) {}

	register(plugin: Plugin): boolean {
		if (this.pluginMap.has(plugin.name)) {
			this.warn("Rejected duplicate plugin registration", {
				plugin: plugin.name,
			});
			return false;
		}
		this.plugins.push(plugin);
		this.pluginMap.set(plugin.name, plugin);
		return true;
	}

	unregister(name: string): boolean {
		const plugin = this.pluginMap.get(name);
		if (!plugin) return false;
		this.plugins.splice(this.plugins.indexOf(plugin), 1);
		this.pluginMap.delete(name);
		return true;
	}

	get(name: string): Plugin | undefined {
		return this.pluginMap.get(name);
	}

	list(): Plugin[] {
		return [...this.plugins];
	}

	// ── Plugin lifecycle ──

	async initAll(ctx: PluginContext): Promise<void> {
		for (const plugin of this.plugins) {
			if (!plugin.onPluginInit) continue;
			await this.guard(plugin, "onPluginInit", () => plugin.onPluginInit!(ctx));
		}
	}

	async destroyAll(ctx: PluginContext): Promise<void> {
		for (const plugin of this.plugins) {
			if (!plugin.onPluginDestroy) continue;
			await this.guard(plugin, "onPluginDestroy", () =>
				plugin.onPluginDestroy!(ctx),
			);
		}
	}

	// ── Legacy Compatibility Shims ──
	async initAgent(runtime: any): Promise<void> {
		for (const plugin of this.plugins) {
			if (!(plugin as any).onInit) continue;
			await this.guard(plugin, "onInit", () => (plugin as any).onInit(runtime));
		}
	}

	async startAgent(runtime: any): Promise<void> {
		for (const plugin of this.plugins) {
			if (!(plugin as any).onStart) continue;
			await this.guard(plugin, "onStart", () => (plugin as any).onStart(runtime));
		}
	}

	async stopAgent(runtime: any): Promise<void> {
		for (const plugin of this.plugins) {
			if (!(plugin as any).onStop) continue;
			await this.guard(plugin, "onStop", () => (plugin as any).onStop(runtime));
		}
	}

	async destroyAgent(runtime: any): Promise<void> {
		for (const plugin of this.plugins) {
			if (!(plugin as any).onDestroy) continue;
			await this.guard(plugin, "onDestroy", () => (plugin as any).onDestroy(runtime));
		}
	}

	async dispatchMessage(msg: InboundMessage, runtime: any): Promise<void> {
		for (const plugin of this.plugins) {
			if (!(plugin as any).onMessage) continue;
			await this.guard(plugin, "onMessage", () => (plugin as any).onMessage(msg, runtime));
		}
	}

	async dispatchResponse(content: string, runtime: any): Promise<void> {
		for (const plugin of this.plugins) {
			if (!(plugin as any).onResponse) continue;
			await this.guard(plugin, "onResponse", () => (plugin as any).onResponse(content, runtime));
		}
	}




	// ── Model hooks ──

	async applyPreModel(
		messages: Array<Record<string, unknown>>,
		context: ModelHookContext,
	): Promise<Array<Record<string, unknown>>> {
		let current = messages;
		for (const plugin of this.plugins) {
			if (!plugin.onPreModel) continue;
			const result = await this.guard(plugin, "onPreModel", () =>
				plugin.onPreModel!(current, context),
			);
			if (result) current = result;
		}
		return current;
	}

	async applyPostModel(
		response: Record<string, unknown>,
		context: ModelHookContext,
	): Promise<Record<string, unknown>> {
		let current = response;
		for (const plugin of this.plugins) {
			if (!plugin.onPostModel) continue;
			const result = await this.guard(plugin, "onPostModel", () =>
				plugin.onPostModel!(current, context),
			);
			if (result) current = result;
		}
		return current;
	}

	// ── Tool hooks ──

	async applyPreTool(
		toolName: string,
		args: Record<string, unknown>,
		context: ToolHookContext,
	): Promise<{ proceed: boolean; args: Record<string, unknown> }> {
		let currentArgs = args;
		for (const plugin of this.plugins) {
			if (!plugin.onPreTool) continue;
			const result = await this.guard(plugin, "onPreTool", () =>
				plugin.onPreTool!(toolName, currentArgs, context),
			);
			if (result) {
				if (result.proceed === false)
					return { proceed: false, args: currentArgs };
				if (result.modifiedArgs) currentArgs = result.modifiedArgs;
			}
		}
		return { proceed: true, args: currentArgs };
	}

	async applyPostTool(
		toolName: string,
		args: Record<string, unknown>,
		result: string,
		context: ToolHookContext,
	): Promise<void> {
		for (const plugin of this.plugins) {
			if (!plugin.onPostTool) continue;
			await this.guard(plugin, "onPostTool", () =>
				plugin.onPostTool!(toolName, args, result, context),
			);
		}
	}

	// ── Session hooks ──

	async sessionStart(context: SessionHookContext): Promise<void> {
		for (const plugin of this.plugins) {
			if (!plugin.onSessionStart) continue;
			await this.guard(plugin, "onSessionStart", () =>
				plugin.onSessionStart!(context),
			);
		}
	}

	async sessionEnd(context: SessionHookContext): Promise<void> {
		for (const plugin of this.plugins) {
			if (!plugin.onSessionEnd) continue;
			await this.guard(plugin, "onSessionEnd", () =>
				plugin.onSessionEnd!(context),
			);
		}
	}

	async sessionSwitch(context: SessionHookContext): Promise<void> {
		for (const plugin of this.plugins) {
			if (!plugin.onSessionSwitch) continue;
			await this.guard(plugin, "onSessionSwitch", () =>
				plugin.onSessionSwitch!(context),
			);
		}
	}

	// ── Internals ──

	private async guard<T>(
		plugin: Plugin,
		action: string,
		run: () => T | Promise<T>,
	): Promise<T | undefined> {
		try {
			return await run();
		} catch (error) {
			this.warn("Plugin call failed", {
				plugin: plugin.name,
				action,
				error: error instanceof Error ? error.message : String(error),
			});
			return undefined;
		}
	}

	private warn(message: string, details?: Record<string, unknown>): void {
		this.options.onWarning?.(message, details);
	}
}
