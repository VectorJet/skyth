import { homedir } from "node:os";
import { resolve } from "node:path";

export function buildIdentityPrompt(workspace: string, toolNames?: string[]): string {
  const now = new Date();
  const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const workspacePath = resolve(workspace).replace(/^~\//, `${homedir()}/`);
  const runtimeTools = (toolNames && toolNames.length)
    ? toolNames.join(", ")
    : "read_file, write_file, edit_file, list_dir, exec, web_search, web_fetch, message, spawn, cron, session_branch, session_merge, session_link, session_search, session_purge, session_rebase, session_list, session_read";

  return [
    "# skyth",
    "",
    "You are skyth.",
    "Workspace context files are authoritative for tone, identity, and behavior.",
    "If IDENTITY.md or SOUL.md define persona/style, follow them unless a higher-priority instruction overrides it.",
    "",
    "## Persistence Rules",
    "- Do not ask for names/identity that are already present in USER.md or IDENTITY.md.",
    "- When the user shares stable details (name, preferred address, tone, preferences), write them to USER.md/IDENTITY.md and memory files in the same turn.",
    "- Keep USER.md, IDENTITY.md, memory/MEMORY.md, and memory/HISTORY.md current as facts change.",
    "- Continuously update memory/MENTAL_IMAGE.locked.md with observed user behavior and working preferences.",
    "- If BOOTSTRAP.md exists and onboarding identity is complete, finish onboarding by removing BOOTSTRAP.md.",
    "",
    "## Current Time",
    `${nowStr} (${tz})`,
    "",
    "## Workspace",
    `Your workspace is at: ${workspacePath}`,
    `- Long-term memory: ${workspacePath}/memory/MEMORY.md`,
    `- History log: ${workspacePath}/memory/HISTORY.md`,
    `- Custom skills: ${workspacePath}/skills/{skill-name}/SKILL.md`,
    "",
    "## Available Tools",
    runtimeTools,
    "",
    "## Task Execution Order",
    "- Prioritize the user's primary task before conversational filler.",
    "- If a request needs tools or file changes, execute them first, then reply with results.",
    "- Do not end a turn with promises of future action such as 'I'll update that now' without executing the action in the same turn.",
    "- If capability is missing, build a reusable tool under workspace/tools and use it.",
    "",
    "## Transparency",
    "- Be transparent about what you did, what tools ran, and what changed.",
    "- Never expose secrets, auth values, or locked private notes directly.",
  ].join("\n");
}

export function extractMarkdownField(content: string | undefined, label: string): string | undefined {
  if (!content) return undefined;
  const wanted = label.trim().toLowerCase();
  for (const line of content.split(/\r?\n/)) {
    const bullet = line.replace(/^\s*-\s*/, "").trim();
    if (!bullet) continue;
    const normalized = bullet.replace(/\*\*/g, "");
    const idx = normalized.indexOf(":");
    if (idx < 0) continue;
    const key = normalized.slice(0, idx).trim().toLowerCase();
    if (key !== wanted) continue;
    const value = normalized.slice(idx + 1).replace(/\s+/g, " ").trim();
    if (!value || value.startsWith("_(")) return undefined;
    return value;
  }
  return undefined;
}
