import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hasSuperuserPasswordRecord, verifySuperuserPassword } from "@/cli/cmd/../../auth/superuser";
import { getChannelsDirPath } from "@/cli/cmd/../../config/loader";

export interface AuthGateDeps {
  promptPasswordFn?: (prompt: string) => Promise<string>;
  channelsDir?: string;
  authDir?: string;
}

export function isChannelPreviouslyConfigured(
  channel: string,
  channelsDir?: string,
): boolean {
  const dir = channelsDir ?? getChannelsDirPath();
  const path = join(dir, `${channel}.json`);
  if (!existsSync(path)) return false;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    if (data.enabled === true) return true;
    for (const key of Object.keys(data)) {
      if (key === "enabled") continue;
      const value = data[key];
      if (typeof value === "string" && value.trim().length > 0) return true;
      if (Array.isArray(value) && value.length > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function requireSuperuserForConfiguredChannel(
  channel: string,
  deps?: AuthGateDeps,
): Promise<{ allowed: boolean; reason?: string }> {
  if (!isChannelPreviouslyConfigured(channel, deps?.channelsDir)) {
    return { allowed: true };
  }
  if (!hasSuperuserPasswordRecord(deps?.authDir)) {
    return { allowed: true };
  }

  const promptPassword = deps?.promptPasswordFn;
  if (!promptPassword) {
    return { allowed: false, reason: "Superuser password required to modify a previously configured channel (non-interactive mode)." };
  }

  const password = await promptPassword("Superuser password: ");
  if (!password.trim()) {
    return { allowed: false, reason: "Superuser password is required." };
  }

  const valid = await verifySuperuserPassword(password, deps?.authDir);
  if (!valid) {
    return { allowed: false, reason: "Invalid superuser password." };
  }

  return { allowed: true };
}
