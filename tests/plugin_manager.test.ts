import { describe, expect, test, mock, beforeEach } from "bun:test";
import { PluginManager } from "@/base/base_agent/plugin/manager";
import type {
	Plugin,
	PluginContext,
	ModelHookContext,
	ToolHookContext,
	SessionHookContext,
} from "@/base/base_agent/plugin/types";

const stubRuntime = {
	workspace: "/tmp/test",
} as any;

const modelCtx: ModelHookContext = {
	runId: "r1",
	threadId: "t1",
	stepIndex: 0,
	model: "gpt-4",
};

const toolCtx: ToolHookContext = {
	runId: "r1",
	threadId: "t1",
	agentId: "agent",
	stepIndex: 0,
};

const sessionCtx: SessionHookContext = {
	key: "cli:user",
	channel: "cli",
	chatId: "user",
};

const pluginCtx: PluginContext = {
	agentId: "test-agent",
	workspace: "/tmp/test",
};

function makeMockPlugin(name: string): Plugin {
	return {
		name,
		version: "1.0.0",
		description: `Test plugin ${name}`,
		onPluginInit: mock(() => {}),
		onPluginDestroy: mock(() => {}),
		onInit: mock(() => {}),
		onStart: mock(() => {}),
		onStop: mock(() => {}),
		onDestroy: mock(() => {}),
		onMessage: mock(() => {}),
		onResponse: mock(() => {}),
		onPreModel: mock((messages: Array<Record<string, unknown>>) => messages),
		onPostModel: mock((response: Record<string, unknown>) => response),
		onPreTool: mock(
			(name: string, args: Record<string, unknown>) => undefined,
		),
		onPostTool: mock(() => {}),
		onSessionStart: mock(() => {}),
		onSessionEnd: mock(() => {}),
		onSessionSwitch: mock(() => {}),
	};
}

describe("PluginManager", () => {
	describe("registration", () => {
		test("registers a plugin", () => {
			const mgr = new PluginManager();
			const plugin = makeMockPlugin("test");

			expect(mgr.register(plugin)).toBe(true);
			expect(mgr.get("test")).toBe(plugin);
			expect(mgr.list()).toEqual([plugin]);
		});

		test("rejects duplicate registration", () => {
			const warnings: any[] = [];
			const mgr = new PluginManager({
				onWarning: (msg, details) => warnings.push({ msg, details }),
			});
			const plugin = makeMockPlugin("test");

			expect(mgr.register(plugin)).toBe(true);
			expect(mgr.register(plugin)).toBe(false);
			expect(warnings).toHaveLength(1);
			expect(warnings[0].msg).toContain("duplicate");
		});

		test("unregisters a plugin", () => {
			const mgr = new PluginManager();
			const plugin = makeMockPlugin("test");
			mgr.register(plugin);

			expect(mgr.unregister("test")).toBe(true);
			expect(mgr.get("test")).toBeUndefined();
			expect(mgr.list()).toEqual([]);
		});

		test("unregister returns false for unknown", () => {
			const mgr = new PluginManager();
			expect(mgr.unregister("nonexistent")).toBe(false);
		});

		test("multiple plugins are ordered", () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			const b = makeMockPlugin("b");
			mgr.register(a);
			mgr.register(b);

			expect(mgr.list()).toEqual([a, b]);
		});
	});

	describe("plugin lifecycle hooks", () => {
		test("initAll calls onPluginInit on all plugins", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			const b = makeMockPlugin("b");
			mgr.register(a);
			mgr.register(b);

			await mgr.initAll(pluginCtx);

			expect(a.onPluginInit).toHaveBeenCalledWith(pluginCtx);
			expect(b.onPluginInit).toHaveBeenCalledWith(pluginCtx);
		});

		test("destroyAll calls onPluginDestroy on all plugins", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			mgr.register(a);

			await mgr.destroyAll(pluginCtx);
			expect(a.onPluginDestroy).toHaveBeenCalledWith(pluginCtx);
		});

		test("skips plugins without the hook", async () => {
			const mgr = new PluginManager();
			const plugin: Plugin = { name: "minimal" };
			mgr.register(plugin);

			// Should not throw
			await mgr.initAll(pluginCtx);
			await mgr.destroyAll(pluginCtx);
		});
	});

	describe("agent lifecycle hooks", () => {
		test("initAgent calls onInit on all plugins", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			mgr.register(a);

			await mgr.initAgent(stubRuntime);
			expect(a.onInit).toHaveBeenCalledWith(stubRuntime);
		});

		test("startAgent calls onStart", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			mgr.register(a);

			await mgr.startAgent(stubRuntime);
			expect(a.onStart).toHaveBeenCalledWith(stubRuntime);
		});

		test("stopAgent calls onStop", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			mgr.register(a);

			await mgr.stopAgent(stubRuntime);
			expect(a.onStop).toHaveBeenCalledWith(stubRuntime);
		});

		test("destroyAgent calls onDestroy", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			mgr.register(a);

			await mgr.destroyAgent(stubRuntime);
			expect(a.onDestroy).toHaveBeenCalledWith(stubRuntime);
		});
	});

	describe("message hooks", () => {
		test("dispatchMessage calls onMessage", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			mgr.register(a);

			const msg = {
				channel: "cli",
				chatId: "user",
				content: "hello",
			} as any;
			await mgr.dispatchMessage(msg, stubRuntime);
			expect(a.onMessage).toHaveBeenCalledWith(msg, stubRuntime);
		});

		test("dispatchResponse calls onResponse", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			mgr.register(a);

			await mgr.dispatchResponse("response text", stubRuntime);
			expect(a.onResponse).toHaveBeenCalledWith("response text", stubRuntime);
		});
	});

	describe("model hooks", () => {
		test("applyPreModel chains results through plugins", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			const b = makeMockPlugin("b");
			a.onPreModel = mock((msgs: Array<Record<string, unknown>>) => [
				...msgs,
				{ role: "system", content: "injected by A" },
			]);
			b.onPreModel = mock((msgs: Array<Record<string, unknown>>) => [
				...msgs,
				{ role: "system", content: "injected by B" },
			]);
			mgr.register(a);
			mgr.register(b);

			const initial = [{ role: "user", content: "hi" }];
			const result = await mgr.applyPreModel(initial, modelCtx);

			expect(result).toHaveLength(3);
			expect(result[0].content).toBe("hi");
			expect(result[1].content).toBe("injected by A");
			expect(result[2].content).toBe("injected by B");
			expect(a.onPreModel).toHaveBeenCalledWith(initial, modelCtx);
			expect(b.onPreModel).toHaveBeenCalledWith(
				[
					{ role: "user", content: "hi" },
					{ role: "system", content: "injected by A" },
				],
				modelCtx,
			);
		});

		test("applyPreModel preserves messages when plugin returns void", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			a.onPreModel = mock(() => undefined);
			mgr.register(a);

			const initial = [{ role: "user", content: "hi" }];
			const result = await mgr.applyPreModel(initial, modelCtx);

			expect(result).toBe(initial);
		});

		test("applyPostModel chains results through plugins", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			const b = makeMockPlugin("b");
			a.onPostModel = mock((resp: Record<string, unknown>) => ({
				...resp,
				augmentedBy: "A",
			}));
			b.onPostModel = mock((resp: Record<string, unknown>) => ({
				...resp,
				augmentedBy: "B",
			}));
			mgr.register(a);
			mgr.register(b);

			const initial = { content: "response" };
			const result = await mgr.applyPostModel(initial, modelCtx);

			expect(result.augmentedBy).toBe("B");
		});
	});

	describe("tool hooks", () => {
		test("applyPreTool allows execution by default", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			mgr.register(a);

			const result = await mgr.applyPreTool("some_tool", { input: "test" }, toolCtx);
			expect(result.proceed).toBe(true);
			expect(result.args).toEqual({ input: "test" });
		});

		test("applyPreTool blocks when plugin returns proceed=false", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			a.onPreTool = mock(
				() => ({ proceed: false } as any),
			);
			mgr.register(a);

			const result = await mgr.applyPreTool("some_tool", { input: "test" }, toolCtx);
			expect(result.proceed).toBe(false);
		});

		test("applyPreTool modifies args via plugin", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			a.onPreTool = mock(
				(name: string, args: Record<string, unknown>) => ({
					proceed: true,
					modifiedArgs: { ...args, sanitized: true },
				} as any),
			);
			mgr.register(a);

			const result = await mgr.applyPreTool("some_tool", { input: "test" }, toolCtx);
			expect(result.proceed).toBe(true);
			expect(result.args.sanitized).toBe(true);
		});

		test("applyPreTool stops at first block", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			const b = makeMockPlugin("b");
			let bCalled = false;
			a.onPreTool = mock(() => ({ proceed: false } as any));
			b.onPreTool = mock(() => {
				bCalled = true;
				return undefined;
			});
			mgr.register(a);
			mgr.register(b);

			const result = await mgr.applyPreTool("some_tool", { input: "test" }, toolCtx);
			expect(result.proceed).toBe(false);
			expect(bCalled).toBe(false);
		});

		test("applyPostTool fires for all plugins", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			const b = makeMockPlugin("b");
			mgr.register(a);
			mgr.register(b);

			await mgr.applyPostTool("some_tool", { input: "test" }, "result", toolCtx);
			expect(a.onPostTool).toHaveBeenCalledWith(
				"some_tool",
				{ input: "test" },
				"result",
				toolCtx,
			);
			expect(b.onPostTool).toHaveBeenCalledWith(
				"some_tool",
				{ input: "test" },
				"result",
				toolCtx,
			);
		});
	});

	describe("session hooks", () => {
		test("sessionStart calls onSessionStart", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			mgr.register(a);

			await mgr.sessionStart(sessionCtx);
			expect(a.onSessionStart).toHaveBeenCalledWith(sessionCtx);
		});

		test("sessionEnd calls onSessionEnd", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			mgr.register(a);

			await mgr.sessionEnd(sessionCtx);
			expect(a.onSessionEnd).toHaveBeenCalledWith(sessionCtx);
		});

		test("sessionSwitch calls onSessionSwitch", async () => {
			const mgr = new PluginManager();
			const a = makeMockPlugin("a");
			mgr.register(a);

			await mgr.sessionSwitch(sessionCtx);
			expect(a.onSessionSwitch).toHaveBeenCalledWith(sessionCtx);
		});
	});

	describe("error handling", () => {
		test("catches plugin errors and reports warning", async () => {
			const warnings: any[] = [];
			const mgr = new PluginManager({
				onWarning: (msg, details) => warnings.push({ msg, details }),
			});
			const a = makeMockPlugin("a");
			a.onInit = mock(() => {
				throw new Error("oops");
			});
			mgr.register(a);

			await mgr.initAgent(stubRuntime);
			expect(warnings).toHaveLength(1);
			expect(warnings[0].msg).toContain("Plugin call failed");
			expect(warnings[0].details.plugin).toBe("a");
			expect(warnings[0].details.action).toBe("onInit");
		});

		test("other plugins continue after one fails", async () => {
			const warnings: any[] = [];
			const mgr = new PluginManager({
				onWarning: (msg, details) => warnings.push({ msg, details }),
			});
			const a = makeMockPlugin("a");
			const b = makeMockPlugin("b");
			a.onInit = mock(() => {
				throw new Error("a fails");
			});
			b.onInit = mock(() => {});
			mgr.register(a);
			mgr.register(b);

			await mgr.initAgent(stubRuntime);
			expect(warnings).toHaveLength(1); // Only A's failure
			expect(b.onInit).toHaveBeenCalled();
		});
	});

	describe("empty manager", () => {
		test("all operations work with no plugins", async () => {
			const mgr = new PluginManager();

			expect(mgr.list()).toEqual([]);
			expect(mgr.get("any")).toBeUndefined();
			await mgr.initAll(pluginCtx);
			await mgr.destroyAll(pluginCtx);
			await mgr.initAgent(stubRuntime);
			await mgr.startAgent(stubRuntime);
			await mgr.stopAgent(stubRuntime);
			await mgr.destroyAgent(stubRuntime);
			await mgr.dispatchMessage({} as any, stubRuntime);
			await mgr.dispatchResponse("", stubRuntime);
			expect(await mgr.applyPreModel([], modelCtx)).toEqual([]);
			expect(await mgr.applyPostModel({}, modelCtx)).toEqual({});
			const toolResult = await mgr.applyPreTool("t", {}, toolCtx);
			expect(toolResult.proceed).toBe(true);
			await mgr.applyPostTool("t", {}, "", toolCtx);
			await mgr.sessionStart(sessionCtx);
			await mgr.sessionEnd(sessionCtx);
			await mgr.sessionSwitch(sessionCtx);
		});
	});
});
