import { describe, expect, test } from "bun:test";
import { AgentRegistry } from "../skyth/registries/agent_registry";

describe("agent registry", () => {
  test("generalist agent is discovered", () => {
    const root = process.cwd();
    const registry = new AgentRegistry();
    registry.discoverAgents(root);

    const entry = registry.get("generalist_agent");
    expect(entry).toBeDefined();
    expect(entry?.manifest.name).toBe("generalist_agent");
    expect(entry?.manifestPath.endsWith("agent_manifest.json")).toBeTrue();
  });
});
