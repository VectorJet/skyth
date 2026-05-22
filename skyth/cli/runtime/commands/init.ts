import { initAlias } from "@/cli/cmd/onboarding";
import { optionalBoolFlag, strFlag } from "@/cli/runtime_helpers";
import type { CommandContext, CommandHandler } from "@/cli/runtime/types";

export const initHandler: CommandHandler = async ({
	flags,
}: CommandContext): Promise<number> => {
	const onboardingFlag = (key: string): boolean | undefined =>
		optionalBoolFlag(flags, key);
	const installDaemonFlag = onboardingFlag("install_daemon");
	const output = await initAlias({
		username: strFlag(flags, "username"),
		superuser_password: strFlag(flags, "superuser_password"),
		nickname: strFlag(flags, "nickname"),
		primary_provider: strFlag(flags, "primary_provider"),
		primary_model: strFlag(flags, "primary_model"),
		api_key: strFlag(flags, "api_key"),
		use_secondary: onboardingFlag("use_secondary"),
		use_router: onboardingFlag("use_router"),
		watcher: onboardingFlag("watcher"),
		skip_mcp: onboardingFlag("skip_mcp"),
		install_daemon: installDaemonFlag === true ? true : undefined,
		no_install_daemon: installDaemonFlag === false ? true : undefined,
	});
	console.log(output);
	return 0;
};
