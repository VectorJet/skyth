import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { MemoryStore } from "./memory";
import { SkillsLoader } from "./skills";

export class ContextBuilder {
  private static readonly BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"];
  private readonly workspace: string;
  private readonly memory: MemoryStore;
  private readonly skills: SkillsLoader;

  constructor(workspace: string) {
    this.workspace = workspace;
    this.memory = new MemoryStore(workspace);
    this.skills = new SkillsLoader(workspace);
  }

  buildSystemPrompt(skillNames?: string[]): string {
    const parts: string[] = [];
    parts.push(this.getIdentity());

    const bootstrap = this.loadBootstrapFiles();
    if (bootstrap) parts.push(bootstrap);

    const memory = this.memory.getMemoryContext();
    if (memory) parts.push(`# Memory\n\n${memory}`);

    const alwaysSkills = this.skills.getAlwaysSkills();
    if (alwaysSkills.length) {
      const alwaysContent = this.skills.loadSkillsForContext(alwaysSkills);
      if (alwaysContent) parts.push(`# Active Skills\n\n${alwaysContent}`);
    }

    if (skillNames?.length) {
      const selected = this.skills.loadSkillsForContext(skillNames);
      if (selected) parts.push(`# Requested Skills\n\n${selected}`);
    }

    const summary = this.skills.buildSkillsSummary();
    if (summary) {
      parts.push(`# Skills\n\nUse the read_file tool to load any listed SKILL.md before using that skill.\n\n${summary}`);
    }

    return parts.join("\n\n---\n\n");
  }

  buildMessages(params: {
    history: Array<Record<string, any>>;
    currentMessage: string;
    skillNames?: string[];
    media?: string[];
    channel: string;
    chat_id: string;
    platformChanged?: boolean;
    previousChannel?: string;
    previousChatId?: string;
  }): Array<Record<string, any>> {
    const gatewayContext = [
      "## Gateway Context",
      `Current channel: ${params.channel}`,
      `Current chat ID: ${params.chat_id}`,
      "You are operating behind the skyth gateway. Responses are delivered to the current channel/chat.",
      "Do not describe this as a direct local chat when channel is not 'cli'.",
      "If asked about tools/capabilities, describe gateway/channel-aware behavior.",
    ].join("\n");
    const systemPrompt = `${this.buildSystemPrompt(params.skillNames)}\n\n${gatewayContext}`;
    const messages: Array<Record<string, any>> = [{ role: "system", content: systemPrompt }, ...params.history];

    const transitionNote = params.platformChanged
      ? `\n\n[System note: platform/session changed from ${params.previousChannel ?? "unknown"}:${params.previousChatId ?? "unknown"} to ${params.channel}:${params.chat_id}. Adapt response phrasing and delivery context accordingly.]`
      : "";

    const media = (params.media ?? []).filter((item) => {
      if (!item) return false;
      const lower = item.toLowerCase();
      return lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".gif") || lower.endsWith(".webp");
    });

    if (!media.length) {
      messages.push({ role: "user", content: `${params.currentMessage}${transitionNote}` });
      return messages;
    }

    const content: Array<Record<string, any>> = media.map((path) => ({
      type: "image_url",
      image_url: { url: `file://${path}` },
    }));
    content.push({ type: "text", text: `${params.currentMessage}${transitionNote}` });
    messages.push({ role: "user", content });
    return messages;
  }

  addAssistantMessage(messages: Array<Record<string, any>>, content: string | null, toolCalls: Array<Record<string, any>>, reasoningContent?: string | null): Array<Record<string, any>> {
    const next: Record<string, any> = { role: "assistant", content };
    if (toolCalls.length) next.tool_calls = toolCalls;
    if (reasoningContent !== undefined) next.reasoning_content = reasoningContent;
    return [...messages, next];
  }

  addToolResult(messages: Array<Record<string, any>>, toolCallId: string, name: string, result: string): Array<Record<string, any>> {
    return [...messages, { role: "tool", tool_call_id: toolCallId, name, content: result }];
  }

  private getIdentity(): string {
    const now = new Date();
    const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const workspacePath = resolve(this.workspace).replace(/^~\//, `${homedir()}/`);
    return [
      "# skyth",
      "",
      "You are skyth, a helpful AI assistant.",
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
      "read_file, write_file, edit_file, list_dir, exec, web_search, web_fetch, message, spawn, cron (when enabled).",
      "",
      "IMPORTANT: Use direct text responses for normal conversation.",
      "The 'message' tool is specifically for explicit outbound channel delivery. Use other tools when they are needed for the task.",
    ].join("\n");
  }

  private loadBootstrapFiles(): string {
    const parts: string[] = [];
    for (const file of ContextBuilder.BOOTSTRAP_FILES) {
      const path = resolve(this.workspace, file);
      if (!existsSync(path)) continue;
      const content = readFileSync(path, "utf-8");
      parts.push(`## ${basename(file)}\n\n${content}`);
    }
    return parts.join("\n\n");
  }
}
