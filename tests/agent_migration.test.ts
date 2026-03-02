import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { ContextBuilder } from "../skyth/base/base_agent/context/builder";
import { AgentLoop } from "../skyth/base/base_agent/runtime";
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

class EnforcedToolProvider extends LLMProvider {
  calls = 0;

  async chat(params: { messages: Array<Record<string, any>> }): Promise<LLMResponse> {
    this.calls += 1;
    const last = String(params.messages.at(-1)?.content ?? "");

    if (this.calls === 1) {
      return {
        content: "I will update files.",
        tool_calls: [],
        finish_reason: "stop",
      };
    }

    if (last.includes("Tool enforcement")) {
      return {
        content: null,
        tool_calls: [
          {
            id: "tc-user",
            name: "write_file",
            arguments: {
              path: "USER.md",
              content: "# USER.md\n\n- **Name:** T\n- **What to call them:** T\n",
            },
          },
          {
            id: "tc-identity",
            name: "write_file",
            arguments: {
              path: "IDENTITY.md",
              content: "# IDENTITY.md\n\n- **Name:** zoro\n",
            },
          },
        ],
        finish_reason: "tool_calls",
      };
    }

    return {
      content: "Done",
      tool_calls: [],
      finish_reason: "stop",
    };
  }

  getDefaultModel(): string {
    return "openai/gpt-4o-mini";
  }
}

class TaskPriorityProvider extends LLMProvider {
  calls = 0;

  async chat(params: { messages: Array<Record<string, any>> }): Promise<LLMResponse> {
    this.calls += 1;
    const last = String(params.messages.at(-1)?.content ?? "");

    if (this.calls === 1) {
      return {
        content: "Let me get my bearings and update USER.md now.",
        tool_calls: [],
        finish_reason: "stop",
      };
    }

    if (last.includes("Task priority enforcement")) {
      return {
        content: null,
        tool_calls: [
          {
            id: "tc-user",
            name: "write_file",
            arguments: {
              path: "USER.md",
              content: "# USER.md\n\n- **Name:** T\n- **What to call them:** T\n",
            },
          },
        ],
        finish_reason: "tool_calls",
      };
    }

    return {
      content: "Done. USER.md updated.",
      tool_calls: [],
      finish_reason: "stop",
    };
  }

  getDefaultModel(): string {
    return "openai/gpt-4o-mini";
  }
}

class EmptyFinalAfterToolProvider extends LLMProvider {
  calls = 0;

  async chat(params: { messages: Array<Record<string, any>> }): Promise<LLMResponse> {
    this.calls += 1;
    const last = String(params.messages.at(-1)?.content ?? "");

    if (this.calls === 1) {
      return {
        content: null,
        tool_calls: [
          {
            id: "tc-user",
            name: "write_file",
            arguments: {
              path: "USER.md",
              content: "# USER.md\n\n- **Name:** T\n- **What to call them:** T\n",
            },
          },
        ],
        finish_reason: "tool_calls",
      };
    }

    if (last.includes("Final reply required")) {
      return {
        content: "Saved. I will call you T.",
        tool_calls: [],
        finish_reason: "stop",
      };
    }

    return {
      content: null,
      tool_calls: [],
      finish_reason: "stop",
    };
  }

  getDefaultModel(): string {
    return "openai/gpt-4o-mini";
  }
}

class GenericChatterProvider extends LLMProvider {
  async chat(params: { messages: Array<Record<string, any>> }): Promise<LLMResponse> {
    const last = String(params.messages.at(-1)?.content ?? "");
    if (last.includes("Onboarding continuity")) {
      return {
        content: "Good catch. What should my name be?",
        tool_calls: [],
        finish_reason: "stop",
      };
    }
    return {
      content: "Nothing else right now - I'm all set.",
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
    expect(system).toContain("Task Execution Order");
    expect(system).toContain("Gateway Context");
    expect(system).toContain("Tone Adaptation");
    expect(system).toContain("Platform Output");
    expect(system).toContain("CLI can handle full detail");
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
      "websearch",
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

    expect((response?.content ?? "").length).toBeGreaterThan(0);
    expect(provider.calls).toBeGreaterThan(0);
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

  test("agent loop enforces file tools for onboarding identity updates", async () => {
    const workspace = makeWorkspace();
    writeFileSync(join(workspace, "BOOTSTRAP.md"), "bootstrap flow", "utf-8");
    writeFileSync(
      join(workspace, "USER.md"),
      ["# USER.md", "", "- **Name:**", "- **What to call them:**", ""].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(workspace, "IDENTITY.md"),
      ["# IDENTITY.md", "", "- **Name:**", ""].join("\n"),
      "utf-8",
    );

    const provider = new EnforcedToolProvider();
    const loop = new AgentLoop({
      bus: new MessageBus(),
      provider,
      workspace,
    });

    await loop.processMessage({
      channel: "telegram",
      senderId: "u1",
      chatId: "c1",
      content: "You can call me T, and you are... zoro",
    });

    const userRaw = readFileSync(join(workspace, "USER.md"), "utf-8");
    const identityRaw = readFileSync(join(workspace, "IDENTITY.md"), "utf-8");
    expect(provider.calls).toBeGreaterThan(1);
    expect(userRaw).toContain("What to call them:** T");
    expect(identityRaw).toContain("Name:** zoro");
    expect(existsSync(join(workspace, "BOOTSTRAP.md"))).toBeFalse();
  });

  test("agent loop enforces task execution before deferral-style reply", async () => {
    const workspace = makeWorkspace();
    writeFileSync(
      join(workspace, "USER.md"),
      ["# USER.md", "", "- **Name:**", "- **What to call them:**", ""].join("\n"),
      "utf-8",
    );

    const provider = new TaskPriorityProvider();
    const loop = new AgentLoop({
      bus: new MessageBus(),
      provider,
      workspace,
    });

    const response = await loop.processMessage({
      channel: "telegram",
      senderId: "u1",
      chatId: "c1",
      content: "Update USER.md and set my name to T.",
    });

    const userRaw = readFileSync(join(workspace, "USER.md"), "utf-8");
    expect(provider.calls).toBeGreaterThan(1);
    expect(userRaw).toContain("Name:** T");
    expect(response?.content ?? "").toBe("Done. USER.md updated.");
  });

  test("agent loop does not emit generic fallback when model returns empty final content", async () => {
    const workspace = makeWorkspace();
    writeFileSync(
      join(workspace, "USER.md"),
      ["# USER.md", "", "- **Name:**", "- **What to call them:**", ""].join("\n"),
      "utf-8",
    );

    const provider = new EmptyFinalAfterToolProvider();
    const loop = new AgentLoop({
      bus: new MessageBus(),
      provider,
      workspace,
    });

    const response = await loop.processMessage({
      channel: "telegram",
      senderId: "u1",
      chatId: "c1",
      content: "Call me T",
    });

    expect(response?.content ?? "").toBe("Saved. I will call you T.");
    expect(response?.content ?? "").not.toContain("I've completed processing but have no response to give");
    expect(provider.calls).toBeGreaterThan(1);
  });

  test("agent loop forces onboarding follow-up when bootstrap is incomplete", async () => {
    const workspace = makeWorkspace();
    writeFileSync(join(workspace, "BOOTSTRAP.md"), "bootstrap flow", "utf-8");
    writeFileSync(
      join(workspace, "USER.md"),
      ["# USER.md", "", "- **Name:** T", "- **What to call them:** T", ""].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(workspace, "IDENTITY.md"),
      ["# IDENTITY.md", "", "- **Name:**", ""].join("\n"),
      "utf-8",
    );

    const loop = new AgentLoop({
      bus: new MessageBus(),
      provider: new GenericChatterProvider(),
      workspace,
    });

    const response = await loop.processMessage({
      channel: "telegram",
      senderId: "u1",
      chatId: "c1",
      content: "anything else?",
    });

    expect(response?.content ?? "").toContain("What should my name be?");
    expect(response?.content ?? "").not.toContain("Nothing else right now");
  });
});
