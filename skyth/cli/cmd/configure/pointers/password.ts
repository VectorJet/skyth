import type { ConfigureTopicManifest, ConfigureHandler, ConfigureHandlerArgs } from "@/cli/cmd/configure/registry";
import type { ConfigureArgs, ConfigureDeps } from "@/cli/cmd/configure/index";
import { writeSuperuserPasswordRecord, hasSuperuserPasswordRecord, verifySuperuserPassword } from "@/cli/cmd/configure/../../../auth/superuser";
import { registry } from "@/cli/cmd/configure/registry";

export const MANIFEST: ConfigureTopicManifest = {
  id: "password",
  description: "Set superuser password",
  requiresAuth: true,
};

async function promptTextValue(
  message: string,
  deps: Required<Pick<ConfigureDeps, "promptInputFn">>,
  useClack: boolean,
): Promise<string | undefined> {
  if (!useClack) {
    return (await deps.promptInputFn(message)).trim();
  }
  const { password: clackPassword } = await import("@clack/prompts");
  const value = await clackPassword({ message, mask: "*" });
  const { isCancel } = await import("@clack/prompts");
  if (isCancel(value)) return undefined;
  return String(value ?? "").trim();
}

async function handler({ args, deps, useClack }: ConfigureHandlerArgs): Promise<{ exitCode: number; output: string }> {
  const hasExisting = hasSuperuserPasswordRecord();
  
  if (hasExisting) {
    const currentPassword = await promptTextValue("Current superuser password", deps, useClack);
    if (currentPassword === undefined) return { exitCode: 1, output: "Cancelled." };
    if (!currentPassword) return { exitCode: 1, output: "Error: current password is required." };
    
    const valid = await verifySuperuserPassword(currentPassword);
    if (!valid) return { exitCode: 1, output: "Error: incorrect current password." };
  }

  let newPassword = (args.value ?? "").trim();
  if (!newPassword) {
    newPassword = await promptTextValue("New superuser password", deps, useClack) ?? "";
  }
  if (!newPassword) return { exitCode: 1, output: "Error: password cannot be empty." };
  
  const confirmPassword = await promptTextValue("Confirm new password", deps, useClack);
  if (confirmPassword === undefined) return { exitCode: 1, output: "Cancelled." };
  if (newPassword !== confirmPassword) return { exitCode: 1, output: "Error: passwords do not match." };

  const written = await deps.writeSuperuserPasswordRecordFn(newPassword);
  return { exitCode: 0, output: `Superuser password updated.\nRecord: ${written.path}` };
}

export const topic = { manifest: MANIFEST, handler };
registry.register(topic);
