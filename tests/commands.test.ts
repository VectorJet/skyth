import { describe, expect, test, mock } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

mock.module("@clack/prompts", () => ({
  intro: () => {},
  outro: () => {},
  cancel: () => {},
  note: () => {},
  isCancel: (val: unknown) => val === "cancel",
  text: async () => "mocked",
  password: async () => "mocked",
  confirm: async () => true,
  select: async (opts: any) => opts.initialValue ?? opts.options?.[0]?.value,
  autocomplete: async (opts: any) => opts.initialValue ?? opts.options?.[0]?.value,
}));
import { channelsEditCommand, initAlias, pairingTelegramCommand, runOnboarding } from "../skyth/cli/commands";
import { runInteractiveFlow } from "../skyth/cli/cmd/onboarding/module/flow";
import { Config } from "../skyth/config/schema";
import { AISDKProvider } from "../skyth/providers/ai_sdk_provider";
import { stripModelPrefix } from "../skyth/providers/openai_codex_provider";
import { findByModel, parseModelRef } from "../skyth/providers/registry";

function stripFrontMatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) return content;
  const start = endIndex + "\n---".length;
  return content.slice(start).replace(/^\s+/, "");
}

describe("commands and provider matching", () => {
  test("run onboarding non interactive", async () => {
    const base = join(process.cwd(), ".tmp", `onboard-${Date.now()}`);
    const configPath = join(base, "config.yml");
    const workspace = join(base, "workspace");
    mkdirSync(base, { recursive: true });

    const output = await runOnboarding({
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
    expect(existsSync(join(workspace, "AGENTS.md"))).toBeTrue();
    expect(existsSync(join(workspace, "BOOTSTRAP.md"))).toBeTrue();
    expect(existsSync(join(workspace, "HEARTBEAT.md"))).toBeTrue();
    expect(existsSync(join(workspace, "IDENTITY.md"))).toBeTrue();
    expect(existsSync(join(workspace, "SOUL.md"))).toBeTrue();
    expect(existsSync(join(workspace, "TOOLS.md"))).toBeTrue();
    expect(existsSync(join(workspace, "USER.md"))).toBeTrue();
    expect(existsSync(join(workspace, "memory", "MEMORY.md"))).toBeTrue();
    expect(existsSync(join(workspace, "memory", "HISTORY.md"))).toBeTrue();

    const templateDir = join(process.cwd(), "skyth", "utils", "templates");
    for (const file of ["AGENTS.md", "BOOTSTRAP.md", "HEARTBEAT.md", "IDENTITY.md", "SOUL.md", "TOOLS.md", "USER.md"]) {
      const expected = stripFrontMatter(readFileSync(join(templateDir, file), "utf-8"));
      const actual = readFileSync(join(workspace, file), "utf-8");
      expect(actual).toBe(expected);
    }

    rmSync(base, { recursive: true, force: true });
  });

  test("init alias", async () => {
    const base = join(process.cwd(), ".tmp", `init-${Date.now()}`);
    const output = await initAlias({ username: "tammy", primary_provider: "anthropic", primary_model: "anthropic/claude-sonnet-4-0" }, { configPath: join(base, "config.yml"), workspacePath: join(base, "workspace") });
    expect(output).toContain("Onboarding complete.");
    rmSync(base, { recursive: true, force: true });
  });

  test("run onboarding uses prompt step when username flag is missing", async () => {
    const base = join(process.cwd(), ".tmp", `onboard-prompt-${Date.now()}`);
    const configPath = join(base, "config.yml");
    const workspace = join(base, "workspace");
    mkdirSync(base, { recursive: true });

    await runOnboarding({
      primary_provider: "openai",
      primary_model: "openai/gpt-4.1",
      api_key: "test-key",
    }, {
      configPath,
      workspacePath: workspace,
      promptUsername: async () => "prompted-user",
    });

    const raw = readFileSync(configPath, "utf-8");
    expect(raw).toContain("username: prompted-user");
    rmSync(base, { recursive: true, force: true });
  });

  test("run onboarding stores superuser password in auth jsonl without plaintext", async () => {
    const base = join(process.cwd(), ".tmp", `onboard-superuser-${Date.now()}`);
    const configPath = join(base, "config.yml");
    const workspace = join(base, "workspace");
    const authDir = join(base, "auth");
    mkdirSync(base, { recursive: true });

    const secret = "S3cur3P@ssw0rd!";
    await runOnboarding({
      username: "tammy",
      superuser_password: secret,
      nickname: "Skyth",
      primary_provider: "openai",
      primary_model: "openai/gpt-4.1",
      api_key: "test-key",
    }, {
      configPath,
      workspacePath: workspace,
      authDir,
    });

    const configRaw = readFileSync(configPath, "utf-8");
    expect(configRaw).not.toContain(secret);

    const hashFile = join(authDir, "superuser", "hashes", "superuser_password.jsonl");
    expect(existsSync(hashFile)).toBeTrue();
    const lines = readFileSync(hashFile, "utf-8").split("\n").filter((line) => line.trim().length > 0);
    expect(lines.length).toBe(1);
    const record = JSON.parse(lines[0]!);
    expect(record.kdf.algorithm).toBe("argon2id");
    expect(record.encryption.algorithm).toBe("aes-256-gcm");
    expect(record.salt_bits).toBe(32);
    expect(JSON.stringify(record)).not.toContain(secret);

    rmSync(base, { recursive: true, force: true });
  });

  test("interactive flow skips config handling select when no config exists", async () => {
    const cfg = new Config();

    const flow = await runInteractiveFlow(
      cfg,
      {},
      {
        existingConfigDetected: false,
        write: () => {},
      },
    );

    expect(flow.cancelled).toBeFalse();
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
    const authDir = join(base, "auth");
    mkdirSync(channelsDir, { recursive: true });

    const result = channelsEditCommand(
      {
        channel: "telegram",
        enable: true,
        set: "token=abc123",
      },
      { channelsDir, authDir },
    );
    expect(result.exitCode).toBe(0);

    const raw = JSON.parse(readFileSync(join(channelsDir, "telegram.json"), "utf-8"));
    expect(raw.enabled).toBeTrue();
    expect(raw.token).toBe("[redacted]");

    rmSync(base, { recursive: true, force: true });
  });

  test("pairing telegram command captures /start code and appends allowlist", async () => {
    const base = join(process.cwd(), ".tmp", `pairing-telegram-${Date.now()}`);
    const channelsDir = join(base, "channels");
    const authDir = join(base, "auth");
    mkdirSync(channelsDir, { recursive: true });

    const cfg = new Config();
    cfg.channels.telegram.token = "123:abc";
    cfg.channels.telegram.allow_from = ["111"];

    let updatesCallCount = 0;
    const fetchImpl: typeof fetch = (async (input, init) => {
      const url = String(input);
      const method = url.split("/").at(-1) || "";
      const payload = init?.body ? JSON.parse(String(init.body)) : {};

      if (method === "getUpdates") {
        updatesCallCount += 1;
        if (updatesCallCount === 1) {
          return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({
          ok: true,
          result: [
            {
              update_id: 5,
              message: {
                message_id: 8,
                text: "/start ABC-123",
                from: { id: 7405495226 },
                chat: { id: 7405495226 },
              },
            },
          ],
        }), { status: 200 });
      }

      if (method === "sendMessage") {
        return new Response(JSON.stringify({ ok: true, result: { message_id: 9, payload } }), { status: 200 });
      }

      return new Response(JSON.stringify({ ok: false, description: "unexpected method" }), { status: 500 });
    }) as any;

    const result = await pairingTelegramCommand({
      code: "ABC-123",
      timeout_ms: 2000,
    }, {
      loadConfigFn: () => cfg,
      channelsDir,
      authDir,
      fetchImpl,
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Paired Telegram user 7405495226.");

    const raw = JSON.parse(readFileSync(join(channelsDir, "telegram.json"), "utf-8"));
    expect(raw.allow_from).toEqual(["111", "7405495226"]);
    expect(raw.token).toBe("[redacted]");

    rmSync(base, { recursive: true, force: true });
  });
});
