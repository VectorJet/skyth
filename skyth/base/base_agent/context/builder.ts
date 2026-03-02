import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { encode } from "@toon-format/toon";
import { buildIdentityPrompt, extractMarkdownField } from "@/base/base_agent/context/identity";
import { buildPlatformOutputSection } from "@/base/base_agent/context/platform";
import { buildToneAdaptationSection } from "@/base/base_agent/context/tone";
import { MemoryStore } from "@/base/base_agent/memory/store";
import { SkillsLoader } from "@/base/base_agent/skills/loader";

type WorkspaceContextFile = {
  name: string;
  path: string;
  content: string;
};

export class ContextBuilder {
  private static readonly BOOTSTRAP_FILES = [
    "AGENTS.md",
    "SOUL.md",
    "TOOLS.md",
    "IDENTITY.md",
    "USER.md",
    "HEARTBEAT.md",
    "BOOTSTRAP.md",
  ];
  private readonly workspace: string;
  private readonly memory: MemoryStore;
  private readonly skills: SkillsLoader;

  constructor(workspace: string) {
    this.workspace = workspace;
    this.memory = new MemoryStore(workspace);
    this.skills = new SkillsLoader(workspace);
  }

  buildSystemPrompt(params?: {
    skillNames?: string[];
    toolNames?: string[];
    userLocation?: string;
  }): string {
    const parts: string[] = [];
    parts.push(buildIdentityPrompt(this.workspace, params?.toolNames));
    parts.push(this.buildBehaviorFactorsSection(params?.userLocation));

    const contextFiles = this.loadBootstrapFiles();
    const contextSection = this.buildWorkspaceContextSection(contextFiles);
    if (contextSection) parts.push(contextSection);

    const profileSection = this.buildKnownProfileSection(contextFiles);
    if (profileSection) parts.push(profileSection);

    const memory = this.memory.getMemoryContext();
    if (memory) parts.push(`# Memory\n\n${memory}`);

    const alwaysSkills = this.skills.getAlwaysSkills();
    if (alwaysSkills.length) {
      const alwaysContent = this.skills.loadSkillsForContext(alwaysSkills);
      if (alwaysContent) parts.push(`# Active Skills\n\n${alwaysContent}`);
    }

    if (params?.skillNames?.length) {
      const selected = this.skills.loadSkillsForContext(params.skillNames);
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
    toolNames?: string[];
    userLocation?: string;
    sessionPrimer?: string;
    platformChanged?: boolean;
    previousChannel?: string;
    previousChatId?: string;
    enabledChannels?: string[];
    channelTargets?: Map<string, { channel: string; chatId: string }>;
  }): Array<Record<string, any>> {
    const locationHint = params.userLocation?.trim();
    const toneGuide = buildToneAdaptationSection(params.history, params.currentMessage);
    const platformGuide = buildPlatformOutputSection(params.channel);
    const channelList = params.enabledChannels?.length
      ? params.enabledChannels.join(", ")
      : params.channel;
    const targetLines: string[] = [];
    if (params.channelTargets?.size) {
      for (const [ch, target] of params.channelTargets) {
        targetLines.push(`  - ${ch}: chat_id="${target.chatId}"`);
      }
    }
    const gatewayContext = [
      "## Gateway Context",
      `Current channel: ${params.channel}`,
      `Current chat ID: ${params.chat_id}`,
      `Enabled channels: ${channelList}`,
      ...(targetLines.length
        ? ["Known channel targets (use with message tool):", ...targetLines]
        : []),
      `Location hint (low confidence): ${locationHint || "(unknown)"}`,
      "You are operating behind the skyth gateway. Responses are delivered to the current channel/chat.",
      "You can send messages to any enabled channel using the message tool with the channel and chat_id parameters shown above.",
      "Do not describe this as a direct local chat when channel is not 'cli'.",
      "If asked about tools/capabilities, describe gateway/channel-aware behavior.",
      "",
      toneGuide,
      "",
      platformGuide,
    ].join("\n");
    const systemPrompt = `${this.buildSystemPrompt({
      skillNames: params.skillNames,
      toolNames: params.toolNames,
      userLocation: params.userLocation,
    })}\n\n${gatewayContext}`;
    const messages: Array<Record<string, any>> = [{ role: "system", content: systemPrompt }, ...params.history];
    if (params.sessionPrimer?.trim()) {
      messages.push({
        role: "system",
        content: `${params.sessionPrimer.trim()}\nUse this as context continuity only; do not present it as a quote dump.`,
      });
    }

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
    let content = result;

    // Only convert to TOON if already valid JSON
    try {
      const parsed = JSON.parse(result);
      content = encode(parsed);
    } catch {
      // Not JSON, leave as-is
    }

    return [...messages, { role: "tool", tool_call_id: toolCallId, name, content }];
  }

  private buildBehaviorFactorsSection(userLocation?: string): string {
    const locationHint = userLocation?.trim() || "(unknown)";
    return [
      "# Behavior Factors",
      "",
      "Use this priority model when deciding behavior and memory updates:",
      "1. Very low: speculative assumptions not grounded in session facts.",
      `2. Low: network/location hints (current hint: ${locationHint}) and platform-only cues.`,
      "3. Medium: style defaults when no user preference is known.",
      "4. Medium-high: proactive behavior, opinions, and social tone aligned with SOUL.md.",
      "5. High: transparency about actions, capabilities, and constraints.",
      "6. Very high: user relationship, user instructions, and observed behavior in USER.md + mental image.",
      "",
      "When priorities conflict, choose the higher factor.",
      "Keep proactivity balanced: act without being noisy.",
    ].join("\n");
  }

  private loadBootstrapFiles(): WorkspaceContextFile[] {
    const files: WorkspaceContextFile[] = [];
    for (const file of ContextBuilder.BOOTSTRAP_FILES) {
      const path = resolve(this.workspace, file);
      if (!existsSync(path)) continue;
      const content = readFileSync(path, "utf-8");
      files.push({ name: basename(file), path, content });
    }
    return files;
  }

  private buildWorkspaceContextSection(files: WorkspaceContextFile[]): string {
    if (!files.length) return "";
    const parts: string[] = [
      "# Project Context",
      "",
      "The following workspace context files are loaded:",
      "",
    ];

    const hasSoul = files.some((file) => file.name.toLowerCase() === "soul.md");
    if (hasSoul) {
      parts.push(
        "If SOUL.md is present, embody its persona and tone. Avoid generic default style and follow SOUL.md guidance.",
        "",
      );
    }

    for (const file of files) {
      parts.push(`## ${file.path}`, "", file.content, "");
    }

    return parts.join("\n");
  }

  private buildKnownProfileSection(files: WorkspaceContextFile[]): string {
    const user = files.find((file) => file.name.toLowerCase() === "user.md");
    const identity = files.find((file) => file.name.toLowerCase() === "identity.md");
    const hasBootstrap = files.some((file) => file.name.toLowerCase() === "bootstrap.md");

    const userName = extractMarkdownField(user?.content, "Name");
    const userPreferred = extractMarkdownField(user?.content, "What to call them");
    const assistantName = extractMarkdownField(identity?.content, "Name");

    const lines = [
      "# Known Identity Facts",
      "",
      "Treat these as established facts from workspace files.",
      `- BOOTSTRAP.md present: ${hasBootstrap ? "yes" : "no"}`,
      `- Human name: ${userName ?? "(unknown)"}`,
      `- Human preferred address: ${userPreferred ?? "(unknown)"}`,
      `- Assistant name: ${assistantName ?? "(unknown)"}`,
      "- Do not ask for any field already known above unless the user explicitly asks to change it.",
    ];

    if (hasBootstrap && (!assistantName || !(userPreferred || userName))) {
      lines.push("- Onboarding is incomplete. Ask only for missing fields, then persist updates immediately.");
    }
    if (hasBootstrap && assistantName && (userPreferred || userName)) {
      lines.push("- Onboarding is complete. Delete BOOTSTRAP.md in this turn.");
    }

    return lines.join("\n");
  }
}
