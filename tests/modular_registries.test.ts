import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ManifestValidationError, manifestFromPath } from "../skyth/core/manifest";
import { ManifestRegistry } from "../skyth/core/registry";
import { buildRegistryFromConfig } from "../skyth/registries/mcp_registry";

function writeManifest(path: string, moduleId: string): void {
  mkdirSync(path.split("/").slice(0, -1).join("/"), { recursive: true });
  writeFileSync(path, JSON.stringify({
    id: moduleId,
    name: moduleId,
    version: "1.0.0",
    entrypoint: "pkg.module:main",
    capabilities: ["x"],
    dependencies: [],
    security: { sandbox: "required" },
  }), "utf-8");
}

describe("modular registries", () => {
  test("manifest validation error has field and path", () => {
    const dir = join(process.cwd(), ".tmp", `manifest-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "bad.json");
    writeFileSync(path, '{"id":"a"}', "utf-8");

    let caught: Error | undefined;
    try {
      manifestFromPath(path);
    } catch (error) {
      caught = error as Error;
    }
    expect(caught).toBeDefined();
    expect(caught instanceof ManifestValidationError).toBeTrue();
    expect(String(caught)).toContain(path);
    expect(String(caught)).toContain("name");
  });

  test("discovery order and duplicate detection", () => {
    const dir = join(process.cwd(), ".tmp", `registry-${Date.now()}`);
    const root = join(dir, "agents");
    writeManifest(join(root, "b", "manifest.json"), "b");
    writeManifest(join(root, "a", "manifest.json"), "a");

    const reg = new ManifestRegistry<object>("agents");
    reg.discover([root]);
    expect(reg.ids).toEqual(["a", "b"]);

    const dup = join(dir, "dup");
    writeManifest(join(dup, "x", "manifest.json"), "a");

    expect(() => reg.discover([dup])).toThrow();
  });

  test("fail open for external plugins", () => {
    const dir = join(process.cwd(), ".tmp", `external-${Date.now()}`);
    const internal = join(dir, "internal");
    const external = join(dir, "external");
    writeManifest(join(internal, "ok", "manifest.json"), "ok");

    const bad = join(external, "bad", "manifest.json");
    mkdirSync(join(external, "bad"), { recursive: true });
    writeFileSync(bad, '{"id":"ext"}', "utf-8");

    const reg = new ManifestRegistry<object>("agents");
    reg.discover([internal], [external]);

    expect(reg.ids).toEqual(["ok"]);
    expect(reg.diagnostics.length > 0).toBeTrue();
  });

  test("build mcp registry from runtime config", () => {
    const registry = buildRegistryFromConfig({
      stdio: { command: "npx", args: ["--foo"], env: { A: "1" }, tool_timeout: 9 },
      http: { url: "https://example.com/mcp", headers: { Authorization: "x" }, tool_timeout: 9 },
    });

    expect(registry.ids).toEqual(["mcp.http", "mcp.stdio"]);
    const http = registry.get("mcp.http");
    expect(http).toBeDefined();
    expect(http?.implementation?.url).toBe("https://example.com/mcp");
    expect(http?.implementation?.tool_timeout).toBe(9);
  });
});
