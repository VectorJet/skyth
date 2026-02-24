import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function ensureWorkspaceTemplates(workspace: string): string[] {
  const created: string[] = [];
  const memoryDir = join(workspace, "memory");
  const skillsDir = join(workspace, "skills");
  const agentsDir = join(workspace, "agents", "main", "sessions");
  mkdirSync(memoryDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });

  const agentsPath = join(workspace, "AGENTS.md");
  const soulPath = join(workspace, "SOUL.md");
  const userPath = join(workspace, "USER.md");
  const bootstrapPath = join(workspace, "BOOTSTRAP.md");
  const memoryPath = join(memoryDir, "MEMORY.md");
  const historyPath = join(memoryDir, "HISTORY.md");

  if (!existsSync(agentsPath)) {
    writeFileSync(
      agentsPath,
      [
        "# Agent Instructions",
        "",
        "You are a practical AI assistant. Be concise, accurate, and safe by default.",
        "",
        "## Guidelines",
        "",
        "- Explain actions before running tools.",
        "- Ask for clarification when requirements are ambiguous.",
        "- Prefer least-privilege tooling and explicit confirmations for destructive actions.",
        "- Keep operational notes in memory/MEMORY.md and changes in memory/HISTORY.md.",
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
        "I am Skyth, a pragmatic assistant focused on reliable outcomes.",
        "",
        "## Personality",
        "",
        "- Clear and direct",
        "- Security aware",
        "- Focused on actionable execution",
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
        "Details about the user and how they prefer to work.",
        "",
        "## Preferences",
        "",
        "- Communication style:",
        "- Timezone:",
        "- Language:",
        "",
      ].join("\n"),
      "utf-8",
    );
    created.push("Created USER.md");
  }

  if (!existsSync(bootstrapPath)) {
    writeFileSync(
      bootstrapPath,
      [
        "# Bootstrap",
        "",
        "Start here for first-run workspace setup.",
        "",
        "1. Add project context to USER.md.",
        "2. Review AGENTS.md for operating expectations.",
        "3. Configure providers and channels in ~/.skyth/.",
        "",
      ].join("\n"),
      "utf-8",
    );
    created.push("Created BOOTSTRAP.md");
  }

  if (!existsSync(memoryPath)) {
    writeFileSync(
      memoryPath,
      [
        "# Long-term Memory",
        "",
        "Store stable user and project information here.",
        "",
        "## User",
        "",
        "",
        "## Project",
        "",
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
