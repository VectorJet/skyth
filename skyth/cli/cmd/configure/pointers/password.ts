import type { ConfigureTopicManifest, ConfigureHandler, ConfigureHandlerArgs } from "../registry";
import type { ConfigureArgs, ConfigureDeps } from "../index";
import { writeSuperuserPasswordRecord } from "../../../auth/superuser";
import { registry } from "../registry";

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
  const value = (args.value ?? "").trim() || (await promptTextValue("Superuser password", deps, useClack));
  if (value === undefined) return { exitCode: 1, output: "Cancelled." };
  if (!value.trim()) return { exitCode: 1, output: "Error: password cannot be empty." };
  const written = await deps.writeSuperuserPasswordRecordFn(value.trim());
  return { exitCode: 0, output: `Superuser password updated.\nRecord: ${written.path}` };
}

export const topic = { manifest: MANIFEST, handler };
registry.register(topic);
