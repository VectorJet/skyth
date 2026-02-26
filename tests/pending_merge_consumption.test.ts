import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { MessageBus } from "../skyth/bus/queue";
import { AgentLoop } from "../skyth/agents/generalist_agent/loop";
import { LLMProvider, type LLMResponse } from "../skyth/providers/base";
import { SessionManager } from "../skyth/session/manager";

class StaticProvider extends LLMProvider {
  async chat(_params: {
    messages: Array<Record<string, any>>;
    tools?: Array<Record<string, any>>;
    model?: string;
    max_tokens?: number;
    temperature?: number;
  }): Promise<LLMResponse> {
    return {
      content: "ack",
      tool_calls: [],
      finish_reason: "stop",
    };
  }

  getDefaultModel(): string {
    return "mock/provider";
  }
}

class CrossChannelHandoffProvider extends LLMProvider {
  calls = 0;

  async chat(_params: {
    messages: Array<Record<string, any>>;
    tools?: Array<Record<string, any>>;
    model?: string;
    max_tokens?: number;
    temperature?: number;
  }): Promise<LLMResponse> {
    this.calls += 1;
    if (this.calls === 1) {
      return {
        content: null,
        tool_calls: [
          {
            id: "tc_handoff",
            name: "message",
            arguments: {
              channel: "discord",
              chat_id: "99",
              content: "hey from telegram context",
            },
          },
        ],
        finish_reason: "tool_calls",
      };
    }
    return {
      content: "ack",
      tool_calls: [],
      finish_reason: "stop",
    };
  }

  getDefaultModel(): string {
    return "mock/provider";
  }
}

describe("pending merge consumption", () => {
  test("consumes pending merge when user explicitly asks cross-channel", async () => {
    const workspace = join(process.cwd(), ".tmp", `pending-merge-${Date.now()}`);
    mkdirSync(workspace, { recursive: true });
    try {
      const sessions = new SessionManager(workspace, {
        auto_merge_on_switch: true,
        persist_to_disk: false,
        max_switch_history: 20,
      });

      const source = sessions.getOrCreate("telegram:42");
      source.addMessage("user", "this is so confusing but now lets do operating systems");
      source.addMessage("assistant", "sure");
      sessions.save(source);

      const target = sessions.getOrCreate("discord:99");
      target.metadata.pendingMerge = {
        sourceKey: "telegram:42",
        sourceChannel: "telegram",
        timestamp: Date.now(),
      };
      sessions.save(target);

      const loop = new AgentLoop({
        bus: new MessageBus(),
        provider: new StaticProvider(),
        workspace,
        model: "mock/provider",
        session_manager: sessions,
        enable_global_tools: false,
        session_graph_config: {
          auto_merge_on_switch: true,
          persist_to_disk: false,
          max_switch_history: 20,
        },
      });

      await loop.processMessage(
        {
          channel: "discord",
          senderId: "user",
          chatId: "99",
          content: "ok what was my last message on telegram?",
        },
        "discord:99",
      );

      const updated = sessions.getOrCreate("discord:99");
      const systemMessages = updated.messages.filter(
        (msg) => msg.role === "system" && String(msg.content ?? "").includes("USER-REQUESTED MERGE"),
      );
      expect(systemMessages.length).toBeGreaterThan(0);
      expect(updated.metadata.pendingMerge).toBeUndefined();
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("auto-merges when cross-channel handoff was initiated by message tool", async () => {
    const workspace = join(process.cwd(), ".tmp", `pending-merge-handoff-${Date.now()}`);
    mkdirSync(workspace, { recursive: true });
    try {
      const bus = new MessageBus();
      const sessions = new SessionManager(workspace, {
        auto_merge_on_switch: true,
        persist_to_disk: false,
        max_switch_history: 20,
      });

      const loop = new AgentLoop({
        bus,
        provider: new CrossChannelHandoffProvider(),
        workspace,
        model: "mock/provider",
        session_manager: sessions,
        enable_global_tools: false,
        session_graph_config: {
          auto_merge_on_switch: true,
          persist_to_disk: false,
          max_switch_history: 20,
        },
      });

      const firstResponse = await loop.processMessage({
        channel: "telegram",
        senderId: "user",
        chatId: "42",
        content: "let us continue this on discord",
      });
      expect(firstResponse).toBeNull();

      const sent = await bus.consumeOutboundWithTimeout(500);
      expect(sent).not.toBeNull();
      expect(sent?.channel).toBe("discord");
      expect(sent?.chatId).toBe("99");

      await loop.processMessage({
        channel: "discord",
        senderId: "user",
        chatId: "99",
        content: "cool right?",
      });

      const target = sessions.getOrCreate("discord:99");
      const merged = target.messages.find((msg) =>
        msg.role === "system" && String(msg.content ?? "").includes("CONFIRMED CONTINUATION"),
      );
      expect(Boolean(merged)).toBe(true);
      expect(String((merged as Record<string, any>)?._mergeMeta?.sourceKey ?? "")).toBe("telegram:42");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
