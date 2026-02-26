import { beforeEach, describe, expect, test } from "bun:test";
import { MergeRouter, isExplicitCrossChannelRequest } from "../skyth/session/router";
import { LLMProvider, type LLMResponse } from "../skyth/providers/base";

class MockProvider extends LLMProvider {
  calls = 0;
  private readonly queue: string[];

  constructor(outputs: string[]) {
    super("", "");
    this.queue = [...outputs];
  }

  async chat(_params: {
    messages: Array<Record<string, any>>;
    tools?: Array<Record<string, any>>;
    model?: string;
    max_tokens?: number;
    temperature?: number;
  }): Promise<LLMResponse> {
    this.calls += 1;
    const content = this.queue.shift() ?? "";
    return { content, tool_calls: [], finish_reason: "stop" };
  }

  getDefaultModel(): string {
    return "mock/provider";
  }
}

describe("merge router", () => {
  beforeEach(() => {
    // No shared state between tests.
  });

  test("detects explicit cross-channel intent", () => {
    expect(isExplicitCrossChannelRequest("what was my last message on telegram?")).toBe(true);
    expect(isExplicitCrossChannelRequest("before the switch to discord?")).toBe(true);
    expect(isExplicitCrossChannelRequest("let us talk about operating systems now")).toBe(false);
  });

  test("short-circuits explicit cross-channel request without provider call", async () => {
    const provider = new MockProvider(['{"decision":"separate","confidence":0.1,"reason_code":"x"}']);
    const router = new MergeRouter(provider, "mock/provider");
    const result = await router.classify([], [], "what was my last message on telegram?");
    expect(result.decision).toBe("continue");
    expect(provider.calls).toBe(0);
  });

  test("uses structured LLM JSON output and caches repeat calls", async () => {
    const provider = new MockProvider(['{"decision":"continue","confidence":0.91,"reason_code":"cross_channel_reference"}']);
    const router = new MergeRouter(provider, "mock/provider", {
      cacheTtlMs: 60_000,
      cacheMaxEntries: 8,
      maxSourceMessages: 2,
      maxTargetMessages: 2,
      maxSnippetChars: 120,
    });

    const source = [
      { role: "user", content: "this is so confusing but let us talk about operating system now" },
    ];
    const target = [
      { role: "user", content: "we switched channels and i am still on exam prep" },
    ];

    const first = await router.classify(source as any, target as any, "i am still confused about entropy compression");
    const second = await router.classify(source as any, target as any, "i am still confused about entropy compression");

    expect(first.decision).toBe("continue");
    expect(second.decision).toBe("continue");
    expect(provider.calls).toBe(1);
  });

  test("falls back to ambiguous when LLM output is unparseable", async () => {
    const provider = new MockProvider(["not-json and not-decision"]);
    const router = new MergeRouter(provider, "mock/provider");
    const result = await router.classify(
      [{ role: "user", content: "talking about math exam prep" }] as any,
      [{ role: "user", content: "what next?" }] as any,
      "ok",
    );

    expect(result.decision).toBe("ambiguous");
    expect(result.reason).toContain("unparseable");
  });

  test("returns ambiguous when provider is unavailable", async () => {
    const router = new MergeRouter(undefined, undefined);
    const result = await router.classify(
      [{ role: "user", content: "topic A" }] as any,
      [{ role: "user", content: "topic B" }] as any,
      "hello there",
    );

    expect(result.decision).toBe("ambiguous");
  });
});
