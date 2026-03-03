import { describe, expect, test } from "bun:test";
import { BaseTool } from "@/base/tool";
import { ToolRegistry } from "@/registries/tool_registry";

class SampleTool extends BaseTool {
  get name(): string { return "sample"; }
  get description(): string { return "sample tool"; }
  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        query: { type: "string", minLength: 2 },
        count: { type: "integer", minimum: 1, maximum: 10 },
        mode: { type: "string", enum: ["fast", "full"] },
        meta: {
          type: "object",
          properties: {
            tag: { type: "string" },
            flags: { type: "array", items: { type: "string" } },
          },
          required: ["tag"],
        },
      },
      required: ["query", "count"],
    };
  }
  async execute(): Promise<string> { return "ok"; }
}

describe("tool validation", () => {
  test("missing required", () => {
    const tool = new SampleTool();
    const errors = tool.validateParams({ query: "hi" });
    expect(errors.join("; ")).toContain("missing required count");
  });

  test("type and range", () => {
    const tool = new SampleTool();
    expect(tool.validateParams({ query: "hi", count: 0 }).some((e) => e.includes("count must be >= 1"))).toBeTrue();
    expect(tool.validateParams({ query: "hi", count: "2" }).some((e) => e.includes("count should be integer"))).toBeTrue();
  });

  test("enum and min length", () => {
    const tool = new SampleTool();
    const errors = tool.validateParams({ query: "h", count: 2, mode: "slow" });
    expect(errors.some((e) => e.includes("query must be at least 2 chars"))).toBeTrue();
    expect(errors.some((e) => e.includes("mode must be one of"))).toBeTrue();
  });

  test("nested object and array", () => {
    const tool = new SampleTool();
    const errors = tool.validateParams({ query: "hi", count: 2, meta: { flags: [1, "ok"] } });
    expect(errors.some((e) => e.includes("missing required meta.tag"))).toBeTrue();
    expect(errors.some((e) => e.includes("meta.flags[0] should be string"))).toBeTrue();
  });

  test("ignores unknown fields", () => {
    const tool = new SampleTool();
    const errors = tool.validateParams({ query: "hi", count: 2, extra: "x" });
    expect(errors).toEqual([]);
  });

  test("registry returns validation error", async () => {
    const reg = new ToolRegistry();
    reg.register(new SampleTool());
    const result = await reg.execute("sample", { query: "hi" });
    expect(result).toContain("Invalid parameters");
  });
});
