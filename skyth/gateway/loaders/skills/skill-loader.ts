import type { HookManager } from "@/gateway/hooks/index.ts";
import type { LoadSource } from "@/gateway/core/contracts/index.ts";
import type {
	SkillLoader,
	SkillRegistry,
} from "@/gateway/registries/skills/index.ts";

export interface SkillSourceLoaderOptions {
	source?: LoadSource;
	hooks?: HookManager;
}

export class SkillSourceLoader {
	constructor(
		private loader: SkillLoader,
		private options: SkillSourceLoaderOptions = {},
	) {}

	async loadAll(registry: SkillRegistry): Promise<void> {
		await this.loader.loadAllSkills(registry);
	}
}
