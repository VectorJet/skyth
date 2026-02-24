import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function ensureWorkspaceTemplates(workspace: string): string[] {
  const created: string[] = [];
  const memoryDir = join(workspace, "memory");
  const skillsDir = join(workspace, "skills");
  mkdirSync(memoryDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });

  const agentsPath = join(workspace, "AGENTS.md");
  const soulPath = join(workspace, "SOUL.md");
  const userPath = join(workspace, "USER.md");
  const memoryPath = join(memoryDir, "MEMORY.md");
  const historyPath = join(memoryDir, "HISTORY.md");

  if (!existsSync(agentsPath)) {
    writeFileSync(
      agentsPath,
      [
        "# Agent Instructions",
        "",
        "You are a helpful AI assistant. Be concise, accurate, and friendly.",
        "",
        "## Guidelines",
        "",
        "- Always explain what you're doing before taking actions",
        "- Ask for clarification when the request is ambiguous",
        "- Use tools to help accomplish tasks",
        "- Remember important information in memory/MEMORY.md; past events are logged in memory/HISTORY.md",
        "",
      ].join("\n"),
      "utf-8",
    );
    created.push("Created AGENTS.md");
  }

  if (!existsSync(soulPath)) {
    writeFileSync(
      soulPath,
      [
        "# Soul",
        "",
        "I am skyth, a lightweight AI assistant.",
        "",
        "## Personality",
        "",
        "- Helpful and friendly",
        "- Concise and to the point",
        "- Curious and eager to learn",
        "",
      ].join("\n"),
      "utf-8",
    );
    created.push("Created SOUL.md");
  }

  if (!existsSync(userPath)) {
    writeFileSync(
      userPath,
      [
        "# User",
        "",
        "Information about the user goes here.",
        "",
        "## Preferences",
        "",
        "- Communication style: (casual/formal)",
        "- Timezone: (your timezone)",
        "- Language: (your preferred language)",
        "",
      ].join("\n"),
      "utf-8",
    );
    created.push("Created USER.md");
  }

  if (!existsSync(memoryPath)) {
    writeFileSync(
      memoryPath,
      [
        "# Long-term Memory",
        "",
        "This file stores important information that should persist across sessions.",
        "",
        "## User Information",
        "",
        "(Important facts about the user)",
        "",
        "## Preferences",
        "",
        "(User preferences learned over time)",
        "",
      ].join("\n"),
      "utf-8",
    );
    created.push("Created memory/MEMORY.md");
  }

  if (!existsSync(historyPath)) {
    writeFileSync(historyPath, "", "utf-8");
    created.push("Created memory/HISTORY.md");
  }

  return created;
}
