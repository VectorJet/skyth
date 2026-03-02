import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { extractMarkdownField } from "@/base/base_agent/context/identity";

export function completeBootstrapIfReady(workspace: string, onComplete?: () => void): boolean {
  const bootstrapPath = join(workspace, "BOOTSTRAP.md");
  if (!existsSync(bootstrapPath)) return false;

  const identityPath = join(workspace, "IDENTITY.md");
  const userPath = join(workspace, "USER.md");
  if (!existsSync(identityPath) || !existsSync(userPath)) return false;

  let identityRaw = "";
  let userRaw = "";
  try {
    identityRaw = readFileSync(identityPath, "utf-8");
    userRaw = readFileSync(userPath, "utf-8");
  } catch {
    return false;
  }

  const assistantName = extractMarkdownField(identityRaw, "Name");
  const userPreferred = extractMarkdownField(userRaw, "What to call them")
    ?? extractMarkdownField(userRaw, "Name");
  if (!assistantName || !userPreferred) return false;

  try {
    unlinkSync(bootstrapPath);
    onComplete?.();
    return true;
  } catch {
    return false;
  }
}
