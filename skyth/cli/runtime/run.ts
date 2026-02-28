import { runOnboarding } from "@/cli/cmd/onboarding";
import { optionalBoolFlag, strFlag, type ParsedArgs } from "@/cli/runtime_helpers";

export async function runCommandHandler(parsed: ParsedArgs): Promise<number> {
  const { flags, positionals } = parsed;
  
  if (positionals[0] === "onboarding") {
    const output = await runOnboarding({
      username: strFlag(flags, "username"),
      superuser_password: strFlag(flags, "superuser_password"),
      nickname: strFlag(flags, "nickname"),
      primary_provider: strFlag(flags, "primary_provider"),
      primary_model: strFlag(flags, "primary_model"),
      api_key: strFlag(flags, "api_key"),
      use_secondary: optionalBoolFlag(flags, "use_secondary"),
      use_router: optionalBoolFlag(flags, "use_router"),
      watcher: optionalBoolFlag(flags, "watcher"),
      skip_mcp: optionalBoolFlag(flags, "skip_mcp"),
      install_daemon: optionalBoolFlag(flags, "install_daemon") ?? undefined,
      no_install_daemon: optionalBoolFlag(flags, "no_install_daemon") ? true : undefined,
    });
    console.log(output);
    return 0;
  }
  console.error(`Error: unknown run command '${positionals.slice(1).join(" ")}'`);
  return 1;
}
