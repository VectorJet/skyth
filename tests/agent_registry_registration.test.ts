import { describe, expect, test } from "bun:test";
import { AgentRegistry } from "../skyth/registries/agent_registry";

describe("agent registry", () => {
  test("agent discovery runs without bundled manifests", () => {
    const root = process.cwd();
    const registry = new AgentRegistry();
    expect(() => registry.discoverAgents(root)).not.toThrow();
  });
});
