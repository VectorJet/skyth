import { describe, expect, test } from "bun:test";
import { AISDKProvider } from "@/providers/ai_sdk_provider";

describe("AISDKProvider model resolution", () => {
	test("uses the configured provider as transport and strips only that provider prefix", () => {
		const provider = new AISDKProvider({
			provider_name: "kilo",
			default_model: "kilo/deepseek/deepseek-v4-flash:free",
		});

		expect(provider.resolveModel("kilo/deepseek/deepseek-v4-flash:free")).toBe(
			"deepseek/deepseek-v4-flash:free",
		);
	});

	test("keeps nested model ids intact for OpenRouter-style providers", () => {
		const provider = new AISDKProvider({
			provider_name: "openrouter",
			default_model: "openrouter/deepseek/deepseek-chat",
		});

		expect(provider.resolveModel("openrouter/deepseek/deepseek-chat")).toBe(
			"deepseek/deepseek-chat",
		);
	});

	test("does not classify nested provider-looking ids by keyword", () => {
		const provider = new AISDKProvider({
			provider_name: "groq",
			default_model: "groq/openai/gpt-oss-120b",
		});

		expect(provider.resolveModel("groq/openai/gpt-oss-120b")).toBe(
			"openai/gpt-oss-120b",
		);
	});
});
