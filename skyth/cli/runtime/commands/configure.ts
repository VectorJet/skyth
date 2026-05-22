import { configureCommand } from "@/cli/cmd/configure";
import { boolFlag, strFlag } from "@/cli/runtime_helpers";
import type { CommandContext, CommandHandler } from "@/cli/runtime/types";

export const configureHandler: CommandHandler = async ({
	positionals,
	flags,
}: CommandContext): Promise<number> => {
	const sub = positionals[1];
	const result = await configureCommand({
		topic: sub,
		value: strFlag(flags, "value") ?? positionals[2],
		provider: strFlag(flags, "provider") ?? positionals[2],
		api_key: strFlag(flags, "api_key"),
		api_base: strFlag(flags, "api_base"),
		model: strFlag(flags, "model") ?? positionals[2],
		primary: boolFlag(flags, "primary", false),
		channel: positionals[2],
		enable: boolFlag(flags, "enable", false) || undefined,
		disable: boolFlag(flags, "disable", false) || undefined,
		set: strFlag(flags, "set"),
		json: strFlag(flags, "json"),
	});
	if (result.output) {
		const sink = result.exitCode === 0 ? console.log : console.error;
		sink(result.output);
	}
	return result.exitCode;
};
