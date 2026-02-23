import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { ContextBuilder } from "../skyth/agents/generalist_agent/context";
import { AgentLoop } from "../skyth/agents/generalist_agent/loop";
import { MessageBus } from "../skyth/bus/queue";
import { LLMProvider, type LLMResponse } from "../skyth/providers/base";

class FakeProvider extends LLMProvider {
  async chat(): Promise<LLMResponse> {
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
    expect(system).toContain("AGENTS.md");
    expect(system).toContain("agent rules");
    expect(system).toContain("<skills>");
    expect(system).toContain("example");
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
});
