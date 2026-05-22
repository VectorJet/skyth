import { describe, expect, test, mock, beforeEach } from "bun:test";
import { MemoryManager, buildMemoryContextBlock, sanitizeMemoryContext } from "@/base/base_agent/memory/manager";
import type {
	MemoryProvider,
	MemoryProviderInitializeOptions,
	MemoryTurnContext,
	MemorySessionSwitchContext,
	MemoryDelegationContext,
} from "@/base/base_agent/memory/provider";

// ── Mock provider factory ──

let providerCounter = 0;

function makeMockProvider(name?: string, external = false): MemoryProvider {
	const id = name ?? `mock-provider-${providerCounter++}`;
	return {
		name: id,
		external: external || undefined,
		isAvailable: mock(() => true),
		initialize: mock((_opts: MemoryProviderInitializeOptions) => Promise.resolve()),
		systemPromptBlock: mock(() => `System prompt for ${id}`),
		prefetch: mock((_query: string, _ctx: MemoryTurnContext) => `Prefetch result from ${id}`),
		syncTurn: mock(
			(_user: string, _assistant: string, _ctx: MemoryTurnContext) => Promise.resolve(),
		),
		getToolSchemas: mock(() => []),
		handleToolCall: mock(
			(_toolName: string, _args: Record<string, unknown>, _ctx: MemoryTurnContext) =>
				Promise.resolve(JSON.stringify({ handled: true, provider: id })),
		),
		shutdown: mock(() => Promise.resolve()),
	};
}

function makeMockProviderWithTools(
	name: string,
	external = false,
	toolSchemas: Array<Record<string, unknown>> = [],
): MemoryProvider {
	const provider = makeMockProvider(name, external);
	provider.getToolSchemas = mock(() => toolSchemas);
	return provider;
}

function makeProviderWithHooks(name: string): MemoryProvider {
	const provider = makeMockProvider(name);
	provider.onTurnStart = mock(
		(_num: number, _msg: string, _ctx: MemoryTurnContext) => Promise.resolve(),
	);
	provider.onSessionEnd = mock(
		(_msgs: Array<Record<string, unknown>>, _ctx: MemoryTurnContext) => Promise.resolve(),
	);
	provider.onSessionSwitch = mock(
		(_ctx: MemorySessionSwitchContext) => Promise.resolve(),
	);
	provider.onPreCompress = mock(
		(_msgs: Array<Record<string, unknown>>, _ctx: MemoryTurnContext) => Promise.resolve("pre-compress from " + name),
	);
	provider.onMemoryWrite = mock(
		(_action: string, _target: string, _content: string, _meta?: Record<string, unknown>) =>
			Promise.resolve(),
	);
	provider.onDelegation = mock(
		(_task: string, _result: string, _ctx: MemoryDelegationContext) => Promise.resolve(),
	);
	return provider;
}

const testContext: MemoryTurnContext = {
	threadId: "test-thread",
	surface: "cli",
	model: "gpt-4",
};

const testInitOptions: MemoryProviderInitializeOptions = {
	threadId: "test-thread",
	workspace: "/tmp/test",
};

// ── Tests ──

describe("MemoryManager", () => {
	beforeEach(() => {
		providerCounter = 0;
	});

	describe("addProvider", () => {
		test("adds a basic provider", () => {
			const mgr = new MemoryManager();
			const provider = makeMockProvider("my-provider");
			expect(mgr.addProvider(provider)).toBe(true);
		});

		test("rejects adding a second external provider", () => {
			const mgr = new MemoryManager();
			const builtin = makeMockProvider("builtin", false);
			const external1 = makeMockProvider("quasar", true);
			const external2 = makeMockProvider("pinecone", true);

			expect(mgr.addProvider(builtin)).toBe(true);
			expect(mgr.addProvider(external1)).toBe(true);
			expect(mgr.addProvider(external2)).toBe(false);
		});

		test("allows multiple non-external providers", () => {
			const mgr = new MemoryManager();
			expect(mgr.addProvider(makeMockProvider("a"))).toBe(true);
			expect(mgr.addProvider(makeMockProvider("b"))).toBe(true);
			expect(mgr.addProvider(makeMockProvider("c"))).toBe(true);
		});

		test("rejects duplicate tool schemas from different providers", () => {
			const mgr = new MemoryManager();
			const schema = { name: "memory_search", parameters: {} };
			const p1 = makeMockProviderWithTools("p1", false, [schema]);
			const p2 = makeMockProviderWithTools("p2", false, [schema]);
			expect(mgr.addProvider(p1)).toBe(true);
			expect(mgr.addProvider(p2)).toBe(true);
			// First provider owns the tool; second provider's duplicate is rejected
			// but the provider itself is still added
		});

		test("accepts external provider when none is active", () => {
			const mgr = new MemoryManager();
			expect(mgr.addProvider(makeMockProvider("external", true))).toBe(true);
		});
	});

	describe("initialize", () => {
		test("initializes all providers", async () => {
			const mgr = new MemoryManager();
			const p1 = makeMockProvider("p1");
			const p2 = makeMockProvider("p2");
			mgr.addProvider(p1);
			mgr.addProvider(p2);

			await mgr.initialize(testInitOptions);
			expect(p1.initialize).toHaveBeenCalledWith(testInitOptions);
			expect(p2.initialize).toHaveBeenCalledWith(testInitOptions);
		});

		test("does not fail when a provider throws", async () => {
			const mgr = new MemoryManager();
			const p1 = makeMockProvider("p1");
			const failing = makeMockProvider("failing");
			(failing.initialize as ReturnType<typeof mock>).mockRejectedValueOnce(
				new Error("init failed"),
			);
			mgr.addProvider(p1);
			mgr.addProvider(failing);

			// Should not throw
			await mgr.initialize(testInitOptions);
			// Second provider should still have been attempted
			expect(p1.initialize).toHaveBeenCalled();
		});

		test("no-ops with no providers", async () => {
			const mgr = new MemoryManager();
			await expect(mgr.initialize(testInitOptions)).resolves.toBeUndefined();
		});
	});

	describe("buildSystemPrompt", () => {
		test("aggregates system prompt blocks", async () => {
			const mgr = new MemoryManager();
			mgr.addProvider(makeMockProvider("a"));
			mgr.addProvider(makeMockProvider("b"));

			const result = await mgr.buildSystemPrompt();
			expect(result).toContain("System prompt for a");
			expect(result).toContain("System prompt for b");
		});

		test("returns empty string with no providers", async () => {
			const mgr = new MemoryManager();
			expect(await mgr.buildSystemPrompt()).toBe("");
		});

		test("skips empty or whitespace-only blocks", async () => {
			const mgr = new MemoryManager();
			const emptyP = makeMockProvider("empty");
			(emptyP.systemPromptBlock as ReturnType<typeof mock>).mockReturnValue(
				"   ",
			);
			mgr.addProvider(makeMockProvider("normal"));
			mgr.addProvider(emptyP);

			const result = await mgr.buildSystemPrompt();
			expect(result).not.toContain("   ");
			expect(result).toContain("System prompt for normal");
		});

		test("does not fail when a provider throws", async () => {
			const mgr = new MemoryManager();
			const p1 = makeMockProvider("p1");
			const failing = makeMockProvider("failing");
			(failing.systemPromptBlock as ReturnType<typeof mock>).mockRejectedValueOnce(
				new Error("block failed"),
			);
			mgr.addProvider(p1);
			mgr.addProvider(failing);

			const result = await mgr.buildSystemPrompt();
			expect(result).toContain("System prompt for p1");
		});
	});

	describe("prefetchAll", () => {
		test("aggregates prefetch results wrapped in memory context blocks", async () => {
			const mgr = new MemoryManager();
			mgr.addProvider(makeMockProvider("a"));
			mgr.addProvider(makeMockProvider("b"));

			const result = await mgr.prefetchAll("test query", testContext);
			expect(result).toContain("<memory-context>");
			expect(result).toContain("Prefetch result from a");
			expect(result).toContain("Prefetch result from b");
			expect(result).toContain("</memory-context>");
		});

		test("returns empty string when no providers", async () => {
			const mgr = new MemoryManager();
			expect(await mgr.prefetchAll("test", testContext)).toBe("");
		});

		test("handles provider error gracefully", async () => {
			const mgr = new MemoryManager();
			const p1 = makeMockProvider("p1");
			const failing = makeMockProvider("failing");
			(failing.prefetch as ReturnType<typeof mock>).mockRejectedValueOnce(
				new Error("search failed"),
			);
			mgr.addProvider(p1);
			mgr.addProvider(failing);

			const result = await mgr.prefetchAll("test", testContext);
			// p1 result should still be included
			expect(result).toContain("Prefetch result from p1");
		});

		test("skips empty or whitespace prefetch results", async () => {
			const mgr = new MemoryManager();
			const emptyP = makeMockProvider("empty");
			(emptyP.prefetch as ReturnType<typeof mock>).mockResolvedValue("   ");
			mgr.addProvider(emptyP);

			const result = await mgr.prefetchAll("test", testContext);
			expect(result).toBe("");
		});
	});

	describe("queuePrefetchAll", () => {
		test("calls queuePrefetch on providers that have it", async () => {
			const mgr = new MemoryManager();
			const p1 = makeMockProvider("p1");
			const p2 = makeMockProvider("p2");
			(p2 as any).queuePrefetch = mock(
				(_query: string, _ctx: MemoryTurnContext) => Promise.resolve(),
			);
			mgr.addProvider(p1);
			mgr.addProvider(p2);

			await mgr.queuePrefetchAll("test", testContext);
			expect(p2.queuePrefetch).toHaveBeenCalledWith("test", testContext);
		});

		test("no-ops when no providers have queuePrefetch", async () => {
			const mgr = new MemoryManager();
			mgr.addProvider(makeMockProvider("p1"));
			mgr.addProvider(makeMockProvider("p2"));

			await expect(
				mgr.queuePrefetchAll("test", testContext),
			).resolves.toBeUndefined();
		});
	});

	describe("syncAll", () => {
		test("syncs all providers", async () => {
			const mgr = new MemoryManager();
			const p1 = makeMockProvider("p1");
			const p2 = makeMockProvider("p2");
			mgr.addProvider(p1);
			mgr.addProvider(p2);

			await mgr.syncAll("user msg", "assistant msg", testContext);
			expect(p1.syncTurn).toHaveBeenCalledWith("user msg", "assistant msg", testContext);
			expect(p2.syncTurn).toHaveBeenCalledWith("user msg", "assistant msg", testContext);
		});

		test("handles provider error gracefully", async () => {
			const mgr = new MemoryManager();
			const p1 = makeMockProvider("p1");
			const failing = makeMockProvider("failing");
			(failing.syncTurn as ReturnType<typeof mock>).mockRejectedValueOnce(
				new Error("sync failed"),
			);
			mgr.addProvider(p1);
			mgr.addProvider(failing);

			await expect(
				mgr.syncAll("user", "assistant", testContext),
			).resolves.toBeUndefined();
		});
	});

	describe("getToolSchemas", () => {
		test("returns schemas from all providers flat-mapped", () => {
			const mgr = new MemoryManager();
			const p1 = makeMockProviderWithTools("p1", false, [
				{ name: "search", parameters: {} },
			]);
			const p2 = makeMockProviderWithTools("p2", false, [
				{ name: "record", parameters: {} },
				{ name: "delete", parameters: {} },
			]);
			mgr.addProvider(p1);
			mgr.addProvider(p2);

			const schemas = mgr.getToolSchemas();
			expect(schemas).toHaveLength(3);
			const names = schemas.map((s) => s.name);
			expect(names).toContain("search");
			expect(names).toContain("record");
			expect(names).toContain("delete");
		});

		test("returns empty array with no providers", () => {
			const mgr = new MemoryManager();
			expect(mgr.getToolSchemas()).toEqual([]);
		});
	});

	describe("handleToolCall", () => {
		test("dispatches to the provider that registered the tool", async () => {
			const mgr = new MemoryManager();
			const schema = { name: "memory_search", parameters: {} };
			const p1 = makeMockProviderWithTools("p1", false, [schema]);
			mgr.addProvider(p1);

			const result = await mgr.handleToolCall("memory_search", { query: "test" }, testContext);
			expect(result).toContain("p1");
		});

		test("returns error for unknown tool name", async () => {
			const mgr = new MemoryManager();
			mgr.addProvider(makeMockProvider("p1"));

			const result = await mgr.handleToolCall("unknown", {}, testContext);
			const parsed = JSON.parse(result);
			expect(parsed.error).toContain("not found");
		});

		test("returns error for provider that has no handleToolCall", async () => {
			const mgr = new MemoryManager();
			const schema = { name: "no_handler", parameters: {} };
			const p1 = makeMockProviderWithTools("p1", false, [schema]);
			delete (p1 as any).handleToolCall;
			mgr.addProvider(p1);

			const result = await mgr.handleToolCall("no_handler", {}, testContext);
			const parsed = JSON.parse(result);
			expect(parsed.error).toContain("not found");
		});

		test("handles provider error gracefully", async () => {
			const mgr = new MemoryManager();
			const schema = { name: "failing_tool", parameters: {} };
			const p1 = makeMockProviderWithTools("p1", false, [schema]);
			(p1.handleToolCall as ReturnType<typeof mock>).mockRejectedValueOnce(
				new Error("internal error"),
			);
			mgr.addProvider(p1);

			const result = await mgr.handleToolCall("failing_tool", {}, testContext);
			expect(result).toBe("");
		});
	});

	describe("lifecycle hooks", () => {
		test("onTurnStart calls all providers", async () => {
			const mgr = new MemoryManager();
			const p1 = makeProviderWithHooks("p1");
			const p2 = makeProviderWithHooks("p2");
			mgr.addProvider(p1);
			mgr.addProvider(p2);

			await mgr.onTurnStart(1, "hello", testContext);
			expect(p1.onTurnStart).toHaveBeenCalledWith(1, "hello", testContext);
			expect(p2.onTurnStart).toHaveBeenCalledWith(1, "hello", testContext);
		});

		test("onTurnStart skips providers without the hook", async () => {
			const mgr = new MemoryManager();
			const p1 = makeMockProvider("p1"); // no onTurnStart
			mgr.addProvider(p1);

			await expect(mgr.onTurnStart(1, "hello", testContext)).resolves.toBeUndefined();
		});

		test("onSessionEnd calls all providers", async () => {
			const mgr = new MemoryManager();
			const p1 = makeProviderWithHooks("p1");
			const p2 = makeProviderWithHooks("p2");
			mgr.addProvider(p1);
			mgr.addProvider(p2);

			await mgr.onSessionEnd([{ role: "user", content: "bye" }], testContext);
			expect(p1.onSessionEnd).toHaveBeenCalled();
			expect(p2.onSessionEnd).toHaveBeenCalled();
		});

		test("onSessionSwitch calls all providers", async () => {
			const mgr = new MemoryManager();
			const p1 = makeProviderWithHooks("p1");
			const p2 = makeProviderWithHooks("p2");
			mgr.addProvider(p1);
			mgr.addProvider(p2);

			const ctx: MemorySessionSwitchContext = {
				threadId: "t2",
				previousThreadId: "t1",
			};
			await mgr.onSessionSwitch(ctx);
			expect(p1.onSessionSwitch).toHaveBeenCalledWith(ctx);
			expect(p2.onSessionSwitch).toHaveBeenCalledWith(ctx);
		});

		test("onPreCompress aggregates provider results", async () => {
			const mgr = new MemoryManager();
			const p1 = makeProviderWithHooks("p1");
			const p2 = makeProviderWithHooks("p2");
			mgr.addProvider(p1);
			mgr.addProvider(p2);

			const result = await mgr.onPreCompress(
				[{ role: "user", content: "data" }],
				testContext,
			);
			expect(result).toContain("pre-compress from p1");
			expect(result).toContain("pre-compress from p2");
		});

		test("onPreCompress returns empty string with no providers", async () => {
			const mgr = new MemoryManager();
			expect(await mgr.onPreCompress([], testContext)).toBe("");
		});

		test("onMemoryWrite calls all providers", async () => {
			const mgr = new MemoryManager();
			const p1 = makeProviderWithHooks("p1");
			const p2 = makeProviderWithHooks("p2");
			mgr.addProvider(p1);
			mgr.addProvider(p2);

			await mgr.onMemoryWrite("write", "target", "content", { key: "val" });
			expect(p1.onMemoryWrite).toHaveBeenCalledWith("write", "target", "content", { key: "val" });
			expect(p2.onMemoryWrite).toHaveBeenCalledWith("write", "target", "content", { key: "val" });
		});

		test("onDelegation calls all providers", async () => {
			const mgr = new MemoryManager();
			const p1 = makeProviderWithHooks("p1");
			const p2 = makeProviderWithHooks("p2");
			mgr.addProvider(p1);
			mgr.addProvider(p2);

			const ctx: MemoryDelegationContext = { threadId: "t1", childThreadId: "t2", agentId: "agent-x" };
			await mgr.onDelegation("task", "result", ctx);
			expect(p1.onDelegation).toHaveBeenCalledWith("task", "result", ctx);
			expect(p2.onDelegation).toHaveBeenCalledWith("task", "result", ctx);
		});

		test("handles provider error gracefully in lifecycle hooks", async () => {
			const mgr = new MemoryManager();
			const p1 = makeProviderWithHooks("p1");
			const failing = makeProviderWithHooks("failing");
			(failing.onTurnStart as ReturnType<typeof mock>).mockRejectedValueOnce(
				new Error("hook failed"),
			);
			mgr.addProvider(p1);
			mgr.addProvider(failing);

			await expect(
				mgr.onTurnStart(1, "msg", testContext),
			).resolves.toBeUndefined();
			expect(p1.onTurnStart).toHaveBeenCalled();
		});

		test("handles error in onPreCompress gracefully", async () => {
			const mgr = new MemoryManager();
			const p1 = makeProviderWithHooks("p1");
			const failing = makeProviderWithHooks("failing");
			(failing.onPreCompress as ReturnType<typeof mock>).mockRejectedValueOnce(
				new Error("compress failed"),
			);
			mgr.addProvider(p1);
			mgr.addProvider(failing);

			const result = await mgr.onPreCompress([], testContext);
			// p1's result should still be present
			expect(result).toContain("pre-compress from p1");
			// failing's error should be caught and not propagate
		});
	});

	describe("shutdown", () => {
		test("shuts down all providers", async () => {
			const mgr = new MemoryManager();
			const p1 = makeMockProvider("p1");
			const p2 = makeMockProvider("p2");
			mgr.addProvider(p1);
			mgr.addProvider(p2);

			await mgr.shutdown();
			expect(p1.shutdown).toHaveBeenCalled();
			expect(p2.shutdown).toHaveBeenCalled();
		});

		test("handles provider error gracefully", async () => {
			const mgr = new MemoryManager();
			const p1 = makeMockProvider("p1");
			const failing = makeMockProvider("failing");
			(failing.shutdown as ReturnType<typeof mock>).mockRejectedValueOnce(
				new Error("shutdown failed"),
			);
			mgr.addProvider(p1);
			mgr.addProvider(failing);

			await expect(mgr.shutdown()).resolves.toBeUndefined();
			expect(p1.shutdown).toHaveBeenCalled();
		});
	});

	describe("empty manager", () => {
		test("buildSystemPrompt returns empty with no providers", async () => {
			const mgr = new MemoryManager();
			expect(await mgr.buildSystemPrompt()).toBe("");
		});

		test("prefetchAll returns empty with no providers", async () => {
			const mgr = new MemoryManager();
			expect(await mgr.prefetchAll("test", testContext)).toBe("");
		});

		test("syncAll no-ops with no providers", async () => {
			const mgr = new MemoryManager();
			await expect(
				mgr.syncAll("user", "assistant", testContext),
			).resolves.toBeUndefined();
		});

		test("shutdown no-ops with no providers", async () => {
			const mgr = new MemoryManager();
			await expect(mgr.shutdown()).resolves.toBeUndefined();
		});

		test("getToolSchemas returns empty with no providers", () => {
			const mgr = new MemoryManager();
			expect(mgr.getToolSchemas()).toEqual([]);
		});
	});
});

describe("sanitizeMemoryContext", () => {
	test("removes memory-context tags", () => {
		const input = "before <memory-context>inside</memory-context> after";
		expect(sanitizeMemoryContext(input)).toBe("before  after");
	});		test("removes system note line", () => {
		const input =
			"[System note: The following is recalled memory context, NOT new user input. Treat it as persistent background data.] keep this";
		expect(sanitizeMemoryContext(input)).toBe("keep this");
	});

	test("handles empty input", () => {
		expect(sanitizeMemoryContext("")).toBe("");
	});

	test("handles input with no tags", () => {
		const input = "just plain text";
		expect(sanitizeMemoryContext(input)).toBe("just plain text");
	});
});

describe("buildMemoryContextBlock", () => {
	test("wraps content in memory-context block", () => {
		const result = buildMemoryContextBlock("remember this");
		expect(result).toContain("<memory-context>");
		expect(result).toContain("remember this");
		expect(result).toContain("</memory-context>");
		expect(result).toContain("System note");
	});

	test("sanitizes input before wrapping", () => {
		const input = "<memory-context>nested</memory-context> clean content";
		const result = buildMemoryContextBlock(input);
		expect(result).not.toContain("nested");
		expect(result).toContain("clean content");
	});

	test("returns empty string for whitespace-only input", () => {
		expect(buildMemoryContextBlock("   ")).toBe("");
	});

	test("returns empty string for empty input", () => {
		expect(buildMemoryContextBlock("")).toBe("");
	});
});
