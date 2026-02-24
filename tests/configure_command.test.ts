import { describe, expect, test } from "bun:test";
import { configureCommand } from "../skyth/cli/cmd/configure";
import { Config } from "../skyth/config/schema";

describe("configure command", () => {
  test("configure username updates config", async () => {
    const cfg = new Config();
    let saved = false;
    const result = await configureCommand(
      { topic: "username", value: "tammy" },
      {
        loadConfigFn: () => cfg,
        saveConfigFn: () => {
          saved = true;
        },
        promptInputFn: async () => "",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(saved).toBeTrue();
    expect(cfg.username).toBe("tammy");
  });

  test("configure password writes superuser record", async () => {
    const result = await configureCommand(
      { topic: "password", value: "secret-123" },
      {
        writeSuperuserPasswordRecordFn: async () =>
          ({
            path: "/tmp/superuser_password.jsonl",
            record: {} as any,
          }) as any,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Superuser password updated.");
    expect(result.output).toContain("/tmp/superuser_password.jsonl");
  });

  test("configure provider sets api key and api base", async () => {
    const cfg = new Config();
    const result = await configureCommand(
      {
        topic: "provider",
        provider: "openai",
        api_key: "sk-test",
        api_base: "https://example.com/v1",
        primary: true,
      },
      {
        loadConfigFn: () => cfg,
        saveConfigFn: () => {},
        promptInputFn: async () => "",
        chooseProviderFn: async () => undefined,
        listProviderSpecsFn: async () => [{ name: "openai" } as any],
      },
    );

    expect(result.exitCode).toBe(0);
    expect(cfg.providers.openai.api_key).toBe("sk-test");
    expect(cfg.providers.openai.api_base).toBe("https://example.com/v1");
    expect(cfg.primary_model_provider).toBe("openai");
  });

  test("configure model updates primary model and provider", async () => {
    const cfg = new Config();
    const result = await configureCommand(
      { topic: "model", value: "groq/moonshotai/kimi-k2-instruct-0905" },
      {
        loadConfigFn: () => cfg,
        saveConfigFn: () => {},
        promptInputFn: async () => "",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(cfg.primary_model).toBe("groq/moonshotai/kimi-k2-instruct-0905");
    expect(cfg.agents.defaults.model).toBe("groq/moonshotai/kimi-k2-instruct-0905");
    expect(cfg.primary_model_provider).toBe("groq");
  });

  test("configure unknown topic returns error", async () => {
    const result = await configureCommand({ topic: "wat" });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("unknown configure topic");
  });
});
