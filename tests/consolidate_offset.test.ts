import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { AgentLoop } from "../skyth/base/base_agent/runtime";
import { MessageBus } from "../skyth/bus/queue";
import { InboundMessage } from "../skyth/bus/events";
import { LLMProvider, LLMResponse } from "../skyth/providers/base";
import { Session, SessionManager } from "../skyth/session/manager";

const MEMORY_WINDOW = 50;
const KEEP_COUNT = MEMORY_WINDOW / 2;

class FakeProvider extends LLMProvider {
  getDefaultModel(): string {
    return "test-model";
  }

  async chat(): Promise<LLMResponse> {
    return { content: "ok", tool_calls: [], finish_reason: "stop" };
  }
}

function createSessionWithMessages(key: string, count: number, role = "user"): Session {
  const session = new Session(key);
  for (let i = 0; i < count; i++) session.addMessage(role, `msg${i}`);
  return session;
}

function getOldMessages(session: Session, lastConsolidated: number, keepCount: number): any[] {
  return session.messages.slice(lastConsolidated, -keepCount);
}

describe("session basics", () => {
  test("last consolidated persistence", () => {
    const dir = join(process.cwd(), ".tmp", `session-${Date.now()}`);
    const manager = new SessionManager(dir);
    const s1 = createSessionWithMessages("test:persist", 20);
    s1.lastConsolidated = 15;
    manager.save(s1);

    const s2 = manager.getOrCreate("test:persist");
    expect(s2.lastConsolidated).toBe(15);
    expect(s2.messages.length).toBe(20);
  });

  test("clear resets", () => {
    const s = createSessionWithMessages("test:clear", 10);
    s.lastConsolidated = 5;
    s.clear();
    expect(s.messages.length).toBe(0);
    expect(s.lastConsolidated).toBe(0);
  });

  test("history most recent", () => {
    const s = new Session("test:history");
    for (let i = 0; i < 10; i++) {
      s.addMessage("user", `msg${i}`);
      s.addMessage("assistant", `resp${i}`);
    }
    const history = s.getHistory(6);
    expect(history.length).toBe(6);
    expect(history[0].content).toBe("msg7");
    expect(history[5].content).toBe("resp9");
  });

  test("slice logic", () => {
    const s = createSessionWithMessages("test:slice", 60);
    const old = getOldMessages(s, 0, KEEP_COUNT);
    expect(old.length).toBe(35);
    expect(old[0].content).toBe("msg0");
    expect(old.at(-1)?.content).toBe("msg34");
  });
});

describe("consolidation guards", () => {
  test("consolidation guard prevents duplicate tasks", async () => {
    const bus = new MessageBus();
    const provider = new FakeProvider();
    const loop = new AgentLoop({ bus, provider, workspace: join(process.cwd(), ".tmp", `loop-${Date.now()}`), model: "test-model", memory_window: 10 });

    const session = loop.sessions.getOrCreate("cli:test");
    for (let i = 0; i < 15; i++) {
      session.addMessage("user", `msg${i}`);
      session.addMessage("assistant", `resp${i}`);
    }
    loop.sessions.save(session);

    let consolidationCalls = 0;
    loop.consolidateMemory = async () => {
      consolidationCalls += 1;
      await Bun.sleep(50);
      return true;
    };

    const msg: InboundMessage = { channel: "cli", senderId: "user", chatId: "test", content: "hello" };
    await loop.processMessage(msg);
    await loop.processMessage(msg);
    await Bun.sleep(120);

    expect(consolidationCalls).toBe(1);
  });

  test("new waits for in-flight consolidation and preserves messages", async () => {
    const bus = new MessageBus();
    const provider = new FakeProvider();
    const loop = new AgentLoop({ bus, provider, workspace: join(process.cwd(), ".tmp", `loop-${Date.now()}`), model: "test-model", memory_window: 10 });

    const session = loop.sessions.getOrCreate("cli:test");
    for (let i = 0; i < 15; i++) {
      session.addMessage("user", `msg${i}`);
      session.addMessage("assistant", `resp${i}`);
    }
    loop.sessions.save(session);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let archivedCount = 0;
    loop.consolidateMemory = async (sess, archiveAll) => {
      if (archiveAll) {
        archivedCount = sess.messages.length;
        return true;
      }
      await gate;
      return true;
    };

    await loop.processMessage({ channel: "cli", senderId: "user", chatId: "test", content: "hello" });

    const pending = loop.processMessage({ channel: "cli", senderId: "user", chatId: "test", content: "/new" });
    await Bun.sleep(20);
    release();

    const response = await pending;
    expect(response?.content.toLowerCase()).toContain("new session started");
    expect(archivedCount).toBeGreaterThan(0);

    const after = loop.sessions.getOrCreate("cli:test");
    expect(after.messages).toEqual([]);
  });

  test("new does not clear session when archive fails", async () => {
    const bus = new MessageBus();
    const provider = new FakeProvider();
    const loop = new AgentLoop({ bus, provider, workspace: join(process.cwd(), ".tmp", `loop-${Date.now()}`), model: "test-model", memory_window: 10 });

    const session = loop.sessions.getOrCreate("cli:test");
    for (let i = 0; i < 5; i++) {
      session.addMessage("user", `msg${i}`);
      session.addMessage("assistant", `resp${i}`);
    }
    loop.sessions.save(session);
    const beforeCount = session.messages.length;

    loop.consolidateMemory = async (_sess, archiveAll) => !archiveAll;

    const response = await loop.processMessage({ channel: "cli", senderId: "user", chatId: "test", content: "/new" });
    expect(response?.content.toLowerCase()).toContain("failed");

    const after = loop.sessions.getOrCreate("cli:test");
    expect(after.messages.length).toBe(beforeCount);
  });
});
