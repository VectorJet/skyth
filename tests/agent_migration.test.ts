import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { ContextBuilder } from "../skyth/agents/generalist_agent/context";
import { AgentLoop } from "../skyth/agents/generalist_agent/loop";
import { MessageBus } from "../skyth/bus/queue";
import { LLMProvider, type LLMResponse } from "../skyth/providers/base";

class FakeProvider extends LLMProvider {
  calls = 0;

  async chat(): Promise<LLMResponse> {
    this.calls += 1;
    return {
      content: "ok",
      tool_calls: [],
      finish_reason: "stop",
    };
  }

  getDefaultModel(): string {
    return "openai/gpt-4o-mini";
  }
}

function makeWorkspace(): string {
  const dir = join(tmpdir(), `skyth-agent-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("agent migration", () => {
  test("context loads bootstrap markdown and skills summary", () => {
    const workspace = makeWorkspace();
    writeFileSync(join(workspace, "AGENTS.md"), "agent rules", "utf-8");
    writeFileSync(join(workspace, "SOUL.md"), "Tone: concise and sharp.", "utf-8");
    writeFileSync(join(workspace, "BOOTSTRAP.md"), "Boot instructions", "utf-8");
    writeFileSync(join(workspace, "HEARTBEAT.md"), "Check pending jobs", "utf-8");
    writeFileSync(
      join(workspace, "USER.md"),
      ["# USER.md", "", "- **Name:** LinearJet", "- **What to call them:** T", ""].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(workspace, "IDENTITY.md"),
      ["# IDENTITY.md", "", "- **Name:** Zoro", ""].join("\n"),
      "utf-8",
    );
    mkdirSync(join(workspace, "skills", "example"), { recursive: true });
    writeFileSync(
      join(workspace, "skills", "example", "SKILL.md"),
      "---\ndescription: Example skill\n---\nUse this skill.",
      "utf-8",
    );

    const context = new ContextBuilder(workspace);
    const messages = context.buildMessages({
      history: [],
      currentMessage: "hello",
      channel: "cli",
      chat_id: "direct",
    });

    const system = String(messages[0]?.content ?? "");
    expect(system).toContain("# Project Context");
    expect(system).toContain("AGENTS.md");
    expect(system).toContain("SOUL.md");
    expect(system).toContain("BOOTSTRAP.md");
    expect(system).toContain("HEARTBEAT.md");
    expect(system).toContain("embody its persona and tone");
    expect(system).toContain("agent rules");
    expect(system).toContain("<skills>");
    expect(system).toContain("example");
    expect(system).toContain("# Known Identity Facts");
    expect(system).toContain("Human preferred address: T");
    expect(system).toContain("Assistant name: Zoro");
    expect(system).toContain("Do not ask for any field already known");
    expect(system).toContain("Onboarding is complete. Delete BOOTSTRAP.md in this turn.");
    expect(system).toContain("Gateway Context");
    expect(system).toContain("Current channel: cli");
  });

  test("context includes platform transition note", () => {
    const workspace = makeWorkspace();
    const context = new ContextBuilder(workspace);
    const messages = context.buildMessages({
      history: [],
      currentMessage: "hello",
      channel: "telegram",
      chat_id: "1001",
      platformChanged: true,
      previousChannel: "cli",
      previousChatId: "direct",
    });
    const userText = String(messages.at(-1)?.content ?? "");
    expect(userText).toContain("platform/session changed");
    expect(userText).toContain("cli:direct");
    expect(userText).toContain("telegram:1001");
  });

  test("agent loop registers migrated tools", () => {
    const workspace = makeWorkspace();
    const loop = new AgentLoop({
      bus: new MessageBus(),
      provider: new FakeProvider(),
      workspace,
    });

    const names = loop.tools.toolNames;
    for (const required of [
      "read_file",
      "write_file",
      "edit_file",
      "list_dir",
      "exec",
      "web_search",
      "web_fetch",
      "message",
      "spawn",
    ]) {
      expect(names).toContain(required);
    }
  });

  test("agent loop still runs model calls while BOOTSTRAP.md exists", async () => {
    const workspace = makeWorkspace();
    writeFileSync(join(workspace, "BOOTSTRAP.md"), "bootstrap flow", "utf-8");
    const provider = new FakeProvider();
    const loop = new AgentLoop({
      bus: new MessageBus(),
      provider,
      workspace,
    });

    const response = await loop.processMessage({
      channel: "telegram",
      senderId: "u1",
      chatId: "c1",
      content: "yo",
    });

    expect(response?.content ?? "").toBe("ok");
    expect(provider.calls).toBe(1);
  });

  test("agent loop removes BOOTSTRAP.md once identity onboarding fields are present", async () => {
    const workspace = makeWorkspace();
    writeFileSync(join(workspace, "BOOTSTRAP.md"), "bootstrap flow", "utf-8");
    writeFileSync(join(workspace, "IDENTITY.md"), "- **Name:** Zoro\n", "utf-8");
    writeFileSync(join(workspace, "USER.md"), "- **What to call them:** T\n", "utf-8");
    const provider = new FakeProvider();
    const loop = new AgentLoop({
      bus: new MessageBus(),
      provider,
      workspace,
    });

    await loop.processMessage({
      channel: "telegram",
      senderId: "u1",
      chatId: "c1",
      content: "hello",
    });

    expect(existsSync(join(workspace, "BOOTSTRAP.md"))).toBeFalse();
  });

  test("agent loop keeps BOOTSTRAP.md when onboarding identity fields are incomplete", async () => {
    const workspace = makeWorkspace();
    writeFileSync(join(workspace, "BOOTSTRAP.md"), "bootstrap flow", "utf-8");
    writeFileSync(join(workspace, "IDENTITY.md"), "- **Name:**\n", "utf-8");
    writeFileSync(join(workspace, "USER.md"), "- **What to call them:**\n", "utf-8");
    const provider = new FakeProvider();
    const loop = new AgentLoop({
      bus: new MessageBus(),
      provider,
      workspace,
    });

    await loop.processMessage({
      channel: "telegram",
      senderId: "u1",
      chatId: "c1",
      content: "hello",
    });

    expect(existsSync(join(workspace, "BOOTSTRAP.md"))).toBeTrue();
  });
});
