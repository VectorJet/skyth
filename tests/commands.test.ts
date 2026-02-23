import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { channelsEditCommand, initAlias, runOnboarding } from "../skyth/cli/commands";
import { Config } from "../skyth/config/schema";
import { AISDKProvider } from "../skyth/providers/ai_sdk_provider";
import { stripModelPrefix } from "../skyth/providers/openai_codex_provider";
import { findByModel, parseModelRef } from "../skyth/providers/registry";

describe("commands and provider matching", () => {
  test("run onboarding non interactive", () => {
    const base = join(process.cwd(), ".tmp", `onboard-${Date.now()}`);
    const configPath = join(base, "config.yml");
    const workspace = join(base, "workspace");
    mkdirSync(base, { recursive: true });

    const output = runOnboarding({
      username: "tammy",
      nickname: "Skyth",
      primary_provider: "openai",
      primary_model: "openai/gpt-4.1",
      api_key: "test-key",
      use_secondary: false,
      use_router: false,
      watcher: false,
      skip_mcp: true,
    }, { configPath, workspacePath: workspace });

    expect(output).toContain("Config saved");
    expect(output).toContain("Workspace created");
    expect(output).toContain("Onboarding complete.");

    rmSync(base, { recursive: true, force: true });
  });

  test("init alias", () => {
    const base = join(process.cwd(), ".tmp", `init-${Date.now()}`);
    const output = initAlias({ username: "tammy", primary_provider: "anthropic", primary_model: "anthropic/claude-sonnet-4-0" }, { configPath: join(base, "config.yml"), workspacePath: join(base, "workspace") });
    expect(output).toContain("Onboarding complete.");
    rmSync(base, { recursive: true, force: true });
  });

  test("provider name for github copilot", () => {
    const cfg = new Config();
    cfg.agents.defaults.model = "github-copilot/gpt-5.3-codex";
    expect(cfg.getProviderName()).toBe("github_copilot");
  });

  test("provider name for openai codex", () => {
    const cfg = new Config();
    cfg.agents.defaults.model = "openai-codex/gpt-5.1-codex";
    expect(cfg.getProviderName()).toBe("openai_codex");
  });

  test("find by model prefers explicit prefix", () => {
    const spec = findByModel("github-copilot/gpt-5.3-codex");
    expect(spec).toBeDefined();
    expect(spec?.name).toBe("github_copilot");
  });

  test("ai sdk provider canonicalizes github copilot hyphen prefix", () => {
    const provider = new AISDKProvider({ default_model: "github-copilot/gpt-5.3-codex" });
    const resolved = provider.resolveModel("github-copilot/gpt-5.3-codex");
    expect(resolved).toBe("github_copilot/gpt-5.3-codex");
  });

  test("openai codex strip prefix supports hyphen and underscore", () => {
    expect(stripModelPrefix("openai-codex/gpt-5.1-codex")).toBe("gpt-5.1-codex");
    expect(stripModelPrefix("openai_codex/gpt-5.1-codex")).toBe("gpt-5.1-codex");
  });

  test("parse model ref keeps nested model path", () => {
    const parsed = parseModelRef("groq/openai/gpt-oss-120b");
    expect(parsed.providerID).toBe("groq");
    expect(parsed.modelID).toBe("openai/gpt-oss-120b");
  });

  test("channels edit command writes channel config", () => {
    const base = join(process.cwd(), ".tmp", `channels-edit-${Date.now()}`);
    const channelsDir = join(base, "channels");
    mkdirSync(channelsDir, { recursive: true });

    const result = channelsEditCommand(
      {
        channel: "telegram",
        enable: true,
        set: "token=abc123",
      },
      { channelsDir },
    );
    expect(result.exitCode).toBe(0);

    const raw = JSON.parse(readFileSync(join(channelsDir, "telegram.json"), "utf-8"));
    expect(raw.enabled).toBeTrue();
    expect(raw.token).toBe("abc123");

    rmSync(base, { recursive: true, force: true });
  });
});
