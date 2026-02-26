import { describe, expect, test } from "bun:test";
import { AISDKProvider } from "../skyth/providers/ai_sdk_provider";

describe("ai sdk provider message normalization", () => {
  test("assigns stable fallback tool call ids across assistant + tool messages", () => {
    const provider = new AISDKProvider({ default_model: "openai/gpt-4.1-mini" });
    const toMessages = (provider as any).toMessages.bind(provider) as (msgs: Array<Record<string, any>>) => Array<Record<string, any>>;
    const normalized = toMessages([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            type: "function",
            function: {
              name: "message",
              arguments: "{\"channel\":\"telegram\",\"chat_id\":\"1\"}",
            },
          },
        ],
      },
      {
        role: "tool",
        name: "message",
        content: "{\"ok\":true}",
      },
    ]);

    const assistantPart = normalized[0]?.content?.[0];
    const toolPart = normalized[1]?.content?.[0];
    expect(assistantPart?.type).toBe("tool-call");
    expect(toolPart?.type).toBe("tool-result");
    expect(assistantPart?.toolCallId).toBe("call_1");
    expect(toolPart?.toolCallId).toBe("call_1");
    expect(toolPart?.output).toEqual({ type: "json", value: { ok: true } });
  });

  test("sanitizes non-compliant tool ids and tolerates bad argument json", () => {
    const provider = new AISDKProvider({ default_model: "openai/gpt-4.1-mini" });
    const toMessages = (provider as any).toMessages.bind(provider) as (msgs: Array<Record<string, any>>) => Array<Record<string, any>>;
    const normalized = toMessages([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "bad id:1",
            function: {
              name: "message",
              arguments: "{bad-json}",
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "bad id:1",
        name: "message",
        content: "ok",
      },
    ]);

    const assistantPart = normalized[0]?.content?.[0];
    const toolPart = normalized[1]?.content?.[0];
    expect(assistantPart?.toolCallId).toBe("bad_id_1");
    expect(toolPart?.toolCallId).toBe("bad_id_1");
    expect(assistantPart?.input).toEqual({});
    expect(toolPart?.output).toEqual({ type: "text", value: "ok" });
  });
});
