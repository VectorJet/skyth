import { existsSync } from "node:fs";
import { join } from "node:path";
import { channelsEditCommand } from "@/cli/cmd/channels";
import { channelsStatusCommand } from "@/cli/cmd/status";
import { boolFlag, runCommand, strFlag } from "@/cli/runtime_helpers";
import { loadConfig } from "@/config/loader";
import type { CommandContext, CommandHandler } from "@/cli/runtime/types";

export const channelsHandler: CommandHandler = async ({
	positionals,
	flags,
}: CommandContext): Promise<number> => {
	const sub = positionals[1];
	if (!sub || sub === "help" || boolFlag(flags, "help")) {
		console.log(
			[
				"Usage: skyth channels COMMAND [ARGS]...",
				"",
				"Commands:",
				"  status",
				"  edit",
				"  login",
			].join("\n"),
		);
		return 0;
	}
	if (sub === "status") {
		console.log(channelsStatusCommand());
		return 0;
	}
	if (sub === "edit") {
		const channel = positionals[2];
		if (!channel) {
			console.error("Error: channel name is required");
			return 1;
		}
		const result = channelsEditCommand({
			channel,
			enable: boolFlag(flags, "enable", false),
			disable: boolFlag(flags, "disable", false),
			set: strFlag(flags, "set"),
			json: strFlag(flags, "json"),
		});
		console.log(result.output);
		return result.exitCode;
	}
	if (sub === "login") {
		const cfg = loadConfig();
		const bridgeDir = join(process.cwd(), "legacy", "bridge");
		if (!existsSync(join(bridgeDir, "package.json"))) {
			console.error("Error: bridge source not found at legacy/bridge");
			return 1;
		}
		if (!existsSync(join(bridgeDir, "node_modules"))) {
			const installCode = await runCommand("bun", ["install"], bridgeDir);
			if (installCode !== 0) return installCode;
		}
		const env: Record<string, string> = {};
		if (cfg.channels.whatsapp.bridge_token)
			env.BRIDGE_TOKEN = cfg.channels.whatsapp.bridge_token;
		return await runCommand("bun", ["run", "src/index.ts"], bridgeDir, env);
	}
	console.error(`Error: unknown channels command '${sub}'`);
	return 1;
};
