import { describe, expect, test } from "bun:test";
import {
	normalizeLegacyKeys,
	providerDefaults,
} from "../skyth/config/schema_helpers";

describe("config schema helpers", () => {
	test("normalizes legacy channel and provider keys", () => {
		const normalized = normalizeLegacyKeys({
			channels: {
				telegram: { allowFrom: ["123"] },
				slack: { groupAllowFrom: ["456"], dm: { allowFrom: ["789"] } },
			},
			providers: {
				openai: { apiKey: "secret" },
			},
			tools: {
				mcpServers: {
					demo: { toolTimeout: 15 },
				},
			},
		});

		expect(normalized.channels.telegram.allow_from).toEqual(["123"]);
		expect(normalized.channels.slack.group_allow_from).toEqual(["456"]);
		expect(normalized.channels.slack.dm.allow_from).toEqual(["789"]);
		expect(normalized.providers.openai.api_key).toBe("secret");
		expect(normalized.tools.mcp_servers.demo.tool_timeout).toBe(15);
	});

	test("providerDefaults returns empty api key", () => {
		expect(providerDefaults()).toEqual({ api_key: "" });
	});
});
