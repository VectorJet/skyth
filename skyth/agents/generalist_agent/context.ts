import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { encode } from "@toon-format/toon";
import { MemoryStore } from "@/agents/generalist_agent/memory";
import { SkillsLoader } from "@/agents/generalist_agent/skills";

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
    parts.push(this.getIdentity(params?.toolNames));
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
    const toneGuide = this.buildToneAdaptationSection(params.history, params.currentMessage);
    const platformGuide = this.buildPlatformOutputSection(params.channel);
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

  private getIdentity(toolNames?: string[]): string {
    const now = new Date();
    const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const workspacePath = resolve(this.workspace).replace(/^~\//, `${homedir()}/`);
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
      "",
      "IMPORTANT: Use direct text responses for simple conversation that does not require actions.",
      "The 'message' tool is specifically for explicit outbound channel delivery. Use other tools when they are needed for the task.",
    ].join("\n");
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

  private buildToneAdaptationSection(
    history: Array<Record<string, any>>,
    currentMessage: string,
  ): string {
    const userSamples: string[] = [];
    for (const msg of history) {
      if (String(msg?.role ?? "") !== "user") continue;
      const content = typeof msg?.content === "string" ? msg.content : "";
      if (content.trim()) userSamples.push(content.trim());
    }
    if (currentMessage.trim()) userSamples.push(currentMessage.trim());
    const tail = userSamples.slice(-6);
    const joined = tail.join(" ").toLowerCase();
    const avgLen = tail.length
      ? Math.round(tail.reduce((sum, item) => sum + item.length, 0) / tail.length)
      : 0;
    const casualMarkers = (joined.match(/\b(yo|uhh|lol|lmao|bro|idk|wanna|gonna|tryna|nah|yep|nope)\b/g) ?? []).length;
    const terse = avgLen > 0 && avgLen < 24;
    const casual = casualMarkers >= 2;
    const energy = /[!?]{2,}| all caps | -_- | xd | haha | heh /.test(` ${joined} `);

    return [
      "## Tone Adaptation",
      "- Mirror the user's tone and vocabulary lightly while staying clear.",
      `- Current style signal: ${casual ? "casual" : "neutral"}${terse ? ", terse" : ", medium detail"}${energy ? ", expressive" : ""}.`,
      "- If user is short/casual, reply in 1-2 short lines by default.",
      "- If user asks for depth, switch to structured detailed output.",
      "- Avoid bland corporate phrasing and repetitive filler.",
      "- Avoid empty filler like: 'No rush', 'Let me know what you'd like to do', unless the user explicitly asks for reassurance.",
      "- Keep personality consistent with SOUL.md and adapt to user energy in this thread.",
      "- Match verbosity to the user unless they explicitly ask for more depth.",
    ].join("\n");
  }

  private buildPlatformOutputSection(channel: string): string {
    const normalized = channel.trim().toLowerCase();
    if (normalized === "telegram") {
      return [
        "## Platform Output",
        "- Telegram is mobile-first: keep replies concise by default.",
        "- Use lightweight markdown structures: bold, lists, inline code, short code blocks.",
        "- Avoid markdown tables and long preambles.",
        "- Prefer 1-4 short paragraphs unless user asks for deep detail.",
      ].join("\n");
    }
    if (normalized === "discord" || normalized === "slack") {
      return [
        "## Platform Output",
        "- Use medium verbosity unless user asks for deep detail.",
        "- Markdown is supported; use structure when it improves scanability.",
        "- Keep lists compact and avoid filler.",
      ].join("\n");
    }
    if (normalized === "email") {
      return [
        "## Platform Output",
        "- Email supports longer structured responses.",
        "- Use clear sections and concise summaries first.",
      ].join("\n");
    }
    if (normalized === "cli") {
      return [
        "## Platform Output",
        "- CLI can handle full detail and technical depth.",
        "- Use code fences and explicit steps when useful.",
      ].join("\n");
    }
    return [
      "## Platform Output",
      "- Default to concise, structured replies.",
      "- Adapt verbosity to user tone and platform constraints.",
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

    const userName = this.extractMarkdownField(user?.content, "Name");
    const userPreferred = this.extractMarkdownField(user?.content, "What to call them");
    const assistantName = this.extractMarkdownField(identity?.content, "Name");

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

  private extractMarkdownField(content: string | undefined, label: string): string | undefined {
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
}
