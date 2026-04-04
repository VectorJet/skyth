import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Config } from "../skyth/config/schema";
import {
	getApiKeysPath,
	getChannelsDirPath,
	getConfigPath,
	getMcpConfigFile,
	getRuntimeConfigPath,
	loadConfig,
	saveConfig,
} from "../skyth/config/loader";

let tempHome = "";
const realHome = process.env.HOME;

beforeEach(() => {
	tempHome = join(
		process.cwd(),
		".tmp",
		`home-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	);
	mkdirSync(tempHome, { recursive: true });
	process.env.HOME = tempHome;
});

afterEach(() => {
	if (realHome) process.env.HOME = realHome;
	rmSync(tempHome, { recursive: true, force: true });
});

describe("config loader modular", () => {
	test("save and load modular config", async () => {
		const cfg = new Config();
		cfg.username = "tammy";
		cfg.nickname = "Skyth";
		cfg.primary_model = "openrouter/deepseek/deepseek-chat";
		cfg.primary_model_provider = "openrouter";
		cfg.providers.openrouter.api_key = "k-123";
		cfg.channels.telegram.enabled = true;
		cfg.channels.telegram.token = "telegram-secret";
		cfg.tools.web.search.api_key = "search-secret";
		cfg.tools.mcp_servers = {
			filesystem: {
				command: "npx",
				args: ["-y", "@modelcontextprotocol/server-filesystem"],
				env: {},
				url: "",
				headers: {},
				tool_timeout: 30,
			},
		};

		await saveConfig(cfg);
		expect(existsSync(getConfigPath())).toBeTrue();
		expect(existsSync(getRuntimeConfigPath())).toBeTrue();
		expect(existsSync(getApiKeysPath())).toBeTrue();
		expect(existsSync(getMcpConfigFile(cfg.mcp_config_path))).toBeTrue();
		expect(existsSync(getChannelsDirPath())).toBeTrue();
		expect(readFileSync(getApiKeysPath(), "utf-8")).not.toContain("k-123");
		expect(
			readFileSync(join(getChannelsDirPath(), "telegram.json"), "utf-8"),
		).not.toContain("telegram-secret");
		expect(readFileSync(getRuntimeConfigPath(), "utf-8")).not.toContain(
			"search-secret",
		);

		const loaded = loadConfig();
		expect(loaded.username).toBe("tammy");
		expect(loaded.nickname).toBe("Skyth");
		expect(loaded.agents.defaults.model).toBe(
			"openrouter/deepseek/deepseek-chat",
		);
		expect(loaded.providers.openrouter.api_key).toBe("k-123");
		expect(loaded.channels.telegram.enabled).toBeTrue();
		expect(Object.keys(loaded.tools.mcp_servers)).toContain("filesystem");
	});

	test("saveConfig does not overwrite existing channel files", async () => {
		const channelsDir = getChannelsDirPath();
		mkdirSync(channelsDir, { recursive: true });
		const telegramPath = join(channelsDir, "telegram.json");
		writeFileSync(
			telegramPath,
			JSON.stringify(
				{
					enabled: true,
					token: "persisted-token",
					allow_from: ["123"],
				},
				null,
				2,
			),
			"utf-8",
		);

		const cfg = new Config();
		cfg.channels.telegram.enabled = false;
		cfg.channels.telegram.token = "";
		await saveConfig(cfg);

		const loaded = loadConfig();
		expect(loaded.channels.telegram.enabled).toBeTrue();
		expect(loaded.channels.telegram.token).toBe("persisted-token");
		expect(loaded.channels.telegram.allow_from).toEqual(["123"]);
		expect(readFileSync(telegramPath, "utf-8")).not.toContain(
			"persisted-token",
		);
	});

	test("load legacy single file config", () => {
		const legacyPath = join(tempHome, ".skyth", "config.json");
		mkdirSync(join(tempHome, ".skyth"), { recursive: true });
		writeFileSync(
			legacyPath,
			JSON.stringify({
				agents: { defaults: { model: "anthropic/claude-sonnet-4" } },
				providers: { anthropic: { apiKey: "legacy-key" } },
				tools: {
					mcpServers: {
						fetch: {
							command: "uvx",
							args: ["mcp-server-fetch"],
							env: {},
							url: "",
							headers: {},
							toolTimeout: 10,
						},
					},
				},
			}),
			"utf-8",
		);

		const loaded = loadConfig();
		expect(loaded.agents.defaults.model).toBe("anthropic/claude-sonnet-4");
		expect(loaded.primary_model).toBe("anthropic/claude-sonnet-4");
		expect(loaded.providers.anthropic.api_key).toBe("legacy-key");
		expect(Object.keys(loaded.tools.mcp_servers)).toContain("fetch");
		expect(existsSync(getConfigPath())).toBeTrue();
		expect(existsSync(getRuntimeConfigPath())).toBeTrue();
	});

	test("coerces numeric allow_from", () => {
		const configPath = getConfigPath();
		mkdirSync(configPath.split("/").slice(0, -1).join("/"), {
			recursive: true,
		});
		writeFileSync(
			configPath,
			[
				"username: tammy",
				"nickname: Skyth",
				"primary_model_provider: openrouter",
				"primary_model: openrouter/deepseek/deepseek-chat",
				"use_secondary_model: false",
				"use_router: false",
				"watcher: false",
				"mcp_config_path: ~/.skyth/config/mcp/",
			].join("\n"),
			"utf-8",
		);

		const runtimePath = getRuntimeConfigPath();
		mkdirSync(runtimePath.split("/").slice(0, -1).join("/"), {
			recursive: true,
		});
		writeFileSync(
			runtimePath,
			JSON.stringify({
				channels: {
					telegram: {
						enabled: true,
						token: "abc",
						allowFrom: [7405495226],
					},
				},
			}),
			"utf-8",
		);

		const loaded = loadConfig();
		expect(loaded.channels.telegram.allow_from).toEqual(["7405495226"]);
	});
});
