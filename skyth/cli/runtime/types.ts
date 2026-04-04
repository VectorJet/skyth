import type { ArgMap } from "@/cli/runtime_helpers";

export interface CommandContext {
	positionals: string[];
	flags: ArgMap;
}

export type CommandHandler = (ctx: CommandContext) => Promise<number> | number;

export interface CommandSpec {
	name: string;
	handler: CommandHandler;
}
