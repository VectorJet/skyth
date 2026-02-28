import { runOnboarding } from "@/cli/cmd/onboarding";
import { optionalBoolFlag, strFlag, type ParsedArgs } from "@/cli/runtime_helpers";

export async function onboardCommandHandler(parsed: ParsedArgs): Promise<number> {
  const { flags } = parsed;
  const installDaemonFlag = optionalBoolFlag(flags, "install_daemon");
  
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
    install_daemon: installDaemonFlag === true ? true : undefined,
    no_install_daemon: installDaemonFlag === false ? true : undefined,
  });
  console.log(output);
  return 0;
}
