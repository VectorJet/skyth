import { describe, expect, test, beforeEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Session, SessionManager } from "../skyth/session/manager";
import { SessionGraph } from "../skyth/session/graph";

describe("SessionGraph", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = join(process.cwd(), ".tmp", `session-graph-test-${Date.now()}`);
    mkdirSync(workspace, { recursive: true });
  });

  test("should create new session in graph", () => {
    const manager = new SessionManager(workspace);
    const session = manager.getOrCreate("discord:12345");

    expect(session.key).toBe("discord:12345");
    expect(manager.graph.getSessions().length).toBeGreaterThan(0);
  });

  test("should track merge edges", () => {
    const manager = new SessionManager(workspace);

    manager.getOrCreate("discord:12345");
    manager.getOrCreate("telegram:67890");

    manager.graph.merge("discord:12345", "telegram:67890", "compact", 5);
    manager.graph.saveAll();

    const edges = manager.graph.getEdges();
    expect(edges.length).toBe(1);
    expect(edges[0].sourceKey).toBe("discord:12345");
    expect(edges[0].targetKey).toBe("telegram:67890");
    expect(edges[0].mode).toBe("compact");
    expect(edges[0].compactedMessages).toBe(5);
  });

  test("should persist and reload graph", () => {
    {
      const manager = new SessionManager(workspace);
      manager.getOrCreate("discord:12345");
      manager.getOrCreate("telegram:67890");
      manager.getOrCreate("slack:room1");
      manager.graph.merge("discord:12345", "telegram:67890", "full", 10);
      manager.graph.merge("telegram:67890", "slack:room1", "compact", 3);
      manager.graph.saveAll();
    }

    {
      const manager2 = new SessionManager(workspace);
      const sessions = manager2.graph.getSessions();
      const edges = manager2.graph.getEdges();

      expect(sessions.length).toBe(3);
      expect(edges.length).toBe(2);
    }
  });

  test("should record and track switch behavior", () => {
    const manager = new SessionManager(workspace);

    manager.graph.recordSwitch("discord", "telegram");
    manager.graph.recordSwitch("telegram", "slack");
    manager.graph.saveAll();

    const behavior = manager.graph.getBehavior();
    expect(behavior.lastSwitches.length).toBe(2);
    expect(behavior.lastSwitches[0].fromChannel).toBe("discord");
    expect(behavior.lastSwitches[0].toChannel).toBe("telegram");
  });

  test("should determine auto-merge based on recent switches", () => {
    const manager = new SessionManager(workspace);

    manager.graph.recordSwitch("discord", "telegram");
    manager.graph.saveAll();

    const shouldMerge = manager.graph.shouldAutoMerge("discord:123", "telegram:456", 300000);
    expect(shouldMerge).toBe(true);
  });

  test("should not auto-merge same channel", () => {
    const manager = new SessionManager(workspace);

    manager.graph.recordSwitch("discord", "discord");
    manager.graph.saveAll();

    const shouldMerge = manager.graph.shouldAutoMerge("discord:123", "discord:456", 300000);
    expect(shouldMerge).toBe(false);
  });

  test("should clear graph", () => {
    const manager = new SessionManager(workspace);

    manager.getOrCreate("discord:12345");
    manager.graph.merge("discord:12345", "telegram:67890", "compact", 5);
    manager.graph.recordSwitch("discord", "telegram");
    manager.graph.clear();
    manager.graph.saveAll();

    expect(manager.graph.getSessions().length).toBe(0);
    expect(manager.graph.getEdges().length).toBe(0);
    expect(manager.graph.getBehavior().lastSwitches.length).toBe(0);
  });

  test("should visualize graph", () => {
    const manager = new SessionManager(workspace);

    manager.getOrCreate("discord:12345");
    manager.getOrCreate("telegram:67890");
    manager.graph.merge("discord:12345", "telegram:67890", "compact", 5);

    const viz = manager.graph.visualize();
    expect(viz).toContain("Session Graph:");
    expect(viz).toContain("discord:12345");
    expect(viz).toContain("telegram:67890");
  });
});

describe("Session Merge Context", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = join(process.cwd(), ".tmp", `session-merge-test-${Date.now()}`);
    mkdirSync(workspace, { recursive: true });
  });

  test("should merge session messages with summary", () => {
    const manager = new SessionManager(workspace);

    const discordSession = manager.getOrCreate("discord:12345");
    discordSession.addMessage("user", "Hello on discord");
    discordSession.addMessage("assistant", "Hi there!");
    discordSession.addMessage("user", "Can you help with code?");
    manager.save(discordSession);

    const telegramSession = manager.getOrCreate("telegram:67890");

    const summary = `[Session merged from discord: last user message: "Can you help with code?", 3 total messages in session]`;
    telegramSession.messages.unshift({
      role: "system",
      content: summary,
    });

    manager.save(telegramSession);

    expect(telegramSession.messages[0].role).toBe("system");
    expect(telegramSession.messages[0].content).toContain("Session merged from discord");
  });

  test("should track parent relationship", () => {
    const manager = new SessionManager(workspace);

    manager.getOrCreate("discord:12345");
    manager.getOrCreate("telegram:67890");

    manager.graph.merge("discord:12345", "telegram:67890", "compact", 5);

    const telegramBranch = manager.graph.getSession("telegram:67890");
    expect(telegramBranch?.parentKey).toBe("discord:12345");
    expect(telegramBranch?.mergedFrom).toContain("discord:12345");
  });

  test("should get ancestors and descendants", () => {
    const manager = new SessionManager(workspace);

    manager.getOrCreate("discord:12345");
    manager.getOrCreate("telegram:67890");
    manager.getOrCreate("slack:room1");

    manager.graph.merge("discord:12345", "telegram:67890", "full", 10);
    manager.graph.merge("telegram:67890", "slack:room1", "compact", 3);

    const ancestors = manager.graph.getAncestors("slack:room1");
    expect(ancestors).toContain("telegram:67890");
    expect(ancestors).toContain("discord:12345");

    const descendants = manager.graph.getDescendants("discord:12345");
    expect(descendants).toContain("telegram:67890");
    expect(descendants).toContain("slack:room1");
  });
});
