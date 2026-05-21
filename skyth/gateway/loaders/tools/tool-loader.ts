import type { HookManager } from "@/gateway/hooks/index.ts";
import type { LoadSource } from "@/gateway/core/contracts/index.ts";
import type {
	ToolLoader,
	ToolRegistry,
} from "@/gateway/registries/tools/index.ts";

export interface ToolSourceLoaderOptions {
	source?: LoadSource;
	hooks?: HookManager;
}

export class ToolSourceLoader {
	constructor(
		private loader: ToolLoader,
		private options: ToolSourceLoaderOptions = {},
	) {}

	async loadAll(registry: ToolRegistry): Promise<void> {
		await this.loader.loadAllTools(registry);
	}
}
