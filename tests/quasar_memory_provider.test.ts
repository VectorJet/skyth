import { describe, expect, test, mock, beforeEach } from "bun:test";
import type { QuasarMemoryHit } from "@/quasar/protocol";

// ── Mock the Quasar client module ──

const mockPing = mock(() => Promise.resolve());
const mockOpenDb = mock(() => Promise.resolve());
const mockMemorySearch = mock(
	(): Promise<QuasarMemoryHit[]> => Promise.resolve([]),
);
const mockMemoryRecordGatewayTurn = mock(
	(): Promise<number[]> => Promise.resolve([42, 43]),
);

const mockQuasarClient = {
	ping: mockPing,
	openDb: mockOpenDb,
	memorySearch: mockMemorySearch,
	memoryRecordGatewayTurn: mockMemoryRecordGatewayTurn,
	// Stub remaining QuasarClient interface methods
	status: mock(() => Promise.resolve({ result: "status" as const, version: "0.1.0", auth_initialized: false })),
	onboard: mock(() => Promise.resolve()),
	unlock: mock(() => Promise.resolve()),
	readText: mock(() => Promise.resolve(null)),
	writeText: mock(() => Promise.resolve(0)),
	appendHeartbeat: mock(() => Promise.resolve()),
	registerCron: mock(() => Promise.resolve()),
	queuePushUser: mock(() => Promise.resolve(0)),
	queuePushGateway: mock(() => Promise.resolve(0)),
	queueClaimAll: mock(() => Promise.resolve([])),
	queueMarkDone: mock(() => Promise.resolve()),
	queueReleaseInflight: mock(() => Promise.resolve()),
	queuePendingStats: mock(() =>
		Promise.resolve({ user: 0, gateway: 0 }),
	),
	stateRecord: mock(() => Promise.resolve(0)),
};

mock.module("@/quasar/client", () => ({
	getQuasarClient: () => mockQuasarClient,
	QuasarClient: class {},
}));

// ── Import after mock ──

const { QuasarMemoryProvider } = await import(
	"@/base/base_agent/memory/providers/quasar"
);

const testContext = {
	threadId: "test-thread",
	surface: "cli",
	model: "gpt-4",
	runId: "run-1",
};

function makeHits(): QuasarMemoryHit[] {
	return [
		{
			id: 1,
			thread_id: "t1",
			source: "cli",
			role: "user",
			text: "full text",
			snippet: "Hello world",
			rank: 0.95,
			ts_unix_ms: 1_700_000_000_000,
		},
		{
			id: 2,
			thread_id: "t2",
			source: "telegram",
			role: "assistant",
			text: "full text 2",
			snippet: "Response here",
			rank: 0.85,
			ts_unix_ms: 1_700_000_010_000,
		},
	];
}

describe("QuasarMemoryProvider", () => {
	beforeEach(() => {
		mockPing.mockClear();
		mockOpenDb.mockClear();
		mockMemorySearch.mockClear();
		mockMemoryRecordGatewayTurn.mockClear();
	});

	describe("construction", () => {
		test("uses default options", () => {
			const provider = new QuasarMemoryProvider();
			expect(provider.name).toBe("quasar");
			expect(provider.external).toBe(true);
			expect(provider.isAvailable()).toBe(false);
		});

		test("accepts custom options", () => {
			const provider = new QuasarMemoryProvider({
				dbPath: "custom/db",
				actor: "test-agent",
				searchLimit: 10,
			});
			expect(provider.isAvailable()).toBe(false);
		});
	});

	describe("initialize", () => {
		test("connects to Quasar and opens the database", async () => {
			const provider = new QuasarMemoryProvider();
			await provider.initialize({
				threadId: "t1",
				workspace: "/tmp/test",
			});

			expect(mockPing).toHaveBeenCalledTimes(1);
			expect(mockOpenDb).toHaveBeenCalledTimes(1);
			expect(mockOpenDb).toHaveBeenCalledWith({
				dbPath: "memory/main",
				dbKind: "memory",
				createIfMissing: true,
			});
			expect(provider.isAvailable()).toBe(true);
		});

		test("throws and sets ready=false on failure", async () => {
			mockPing.mockRejectedValueOnce(new Error("connection refused"));
			const provider = new QuasarMemoryProvider();

			await expect(
				provider.initialize({ threadId: "t1", workspace: "/tmp/test" }),
			).rejects.toThrow("connection refused");
			expect(provider.isAvailable()).toBe(false);
		});
	});

	describe("systemPromptBlock", () => {
		test("returns empty when not ready", async () => {
			const provider = new QuasarMemoryProvider();
			expect(await provider.systemPromptBlock()).toBe("");
		});

		test("returns prompt when ready", async () => {
			const provider = new QuasarMemoryProvider();
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });

			const block = await provider.systemPromptBlock();
			expect(block).toContain("Memory system (Quasar) is active");
			expect(block).toContain("memory_search");
		});
	});

	describe("prefetch", () => {
		test("returns empty when not ready", async () => {
			const provider = new QuasarMemoryProvider();
			expect(await provider.prefetch("test", testContext)).toBe("");
		});

		test("searches memory and formats results", async () => {
			mockMemorySearch.mockResolvedValueOnce(makeHits());
			const provider = new QuasarMemoryProvider();
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });

			const result = await provider.prefetch("find something", testContext);
			expect(mockMemorySearch).toHaveBeenCalledWith({
				dbPath: "memory/main",
				query: "find something",
				limit: 5,
			});
			expect(result).toContain("Related memory (2 results)");
			expect(result).toContain("Hello world");
			expect(result).toContain("Response here");
		});

		test("returns empty on search error", async () => {
			mockMemorySearch.mockRejectedValueOnce(new Error("search failed"));
			const provider = new QuasarMemoryProvider();
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });

			const result = await provider.prefetch("find something", testContext);
			expect(result).toBe("");
		});

		test("returns empty when no hits found", async () => {
			const provider = new QuasarMemoryProvider();
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });

			const result = await provider.prefetch("nothing", testContext);
			expect(result).toBe("");
		});
	});

	describe("syncTurn", () => {
		test("records the turn when ready", async () => {
			const provider = new QuasarMemoryProvider();
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });

			await provider.syncTurn("user message", "assistant response", testContext);
			expect(mockMemoryRecordGatewayTurn).toHaveBeenCalledWith({
				dbPath: "memory/main",
				channel: "cli",
				chatId: "test-thread",
				userText: "user message",
				assistantText: "assistant response",
				ts: expect.any(Number),
			});
		});

		test("defaults surface to cli when not provided", async () => {
			const provider = new QuasarMemoryProvider();
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });

			await provider.syncTurn("hello", "world", {
				...testContext,
				surface: undefined,
			});
			expect(mockMemoryRecordGatewayTurn).toHaveBeenCalledWith(
				expect.objectContaining({ channel: "cli" }),
			);
		});

		test("no-ops when not ready", async () => {
			const provider = new QuasarMemoryProvider();
			await provider.syncTurn("hello", "world", testContext);
			expect(mockMemoryRecordGatewayTurn).not.toHaveBeenCalled();
		});

		test("handles record error gracefully", async () => {
			mockMemoryRecordGatewayTurn.mockRejectedValueOnce(
				new Error("db error"),
			);
			const provider = new QuasarMemoryProvider();
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });

			// Should not throw
			await provider.syncTurn("hello", "world", testContext);
		});
	});

	describe("getToolSchemas", () => {
		test("returns memory_search and memory_record schemas", () => {
			const provider = new QuasarMemoryProvider();
			const schemas = provider.getToolSchemas();

			expect(schemas).toHaveLength(2);
			const names = schemas.map((s) => s.name);
			expect(names).toContain("memory_search");
			expect(names).toContain("memory_record");
		});

		test("memory_search has required query parameter", () => {
			const provider = new QuasarMemoryProvider();
			const schemas = provider.getToolSchemas();
			const search = schemas.find((s) => s.name === "memory_search");

			expect(search).toBeDefined();
			expect(search!.parameters).toEqual(
				expect.objectContaining({
					required: ["query"],
				}),
			);
		});
	});

	describe("handleToolCall", () => {
		test("memory_search returns formatted results", async () => {
			mockMemorySearch.mockResolvedValueOnce(makeHits());
			const provider = new QuasarMemoryProvider();
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });

			const result = await provider.handleToolCall(
				"memory_search",
				{ query: "test", limit: 3 },
				testContext,
			);
			const parsed = JSON.parse(result);
			expect(parsed.count).toBe(2);
			expect(parsed.results[0].snippet).toBe("Hello world");
			expect(mockMemorySearch).toHaveBeenCalledWith({
				dbPath: "memory/main",
				query: "test",
				limit: 3,
			});
		});

		test("memory_search falls back to default limit", async () => {
			mockMemorySearch.mockResolvedValueOnce([]);
			const provider = new QuasarMemoryProvider({
				searchLimit: 10,
			});
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });

			await provider.handleToolCall(
				"memory_search",
				{ query: "test" },
				testContext,
			);
			expect(mockMemorySearch).toHaveBeenCalledWith(
				expect.objectContaining({ limit: 10 }),
			);
		});

		test("memory_search returns error on failure", async () => {
			mockMemorySearch.mockRejectedValueOnce(new Error("search failed"));
			const provider = new QuasarMemoryProvider();
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });

			const result = await provider.handleToolCall(
				"memory_search",
				{ query: "test" },
				testContext,
			);
			const parsed = JSON.parse(result);
			expect(parsed.error).toContain("search failed");
		});

		test("memory_record stores the fact", async () => {
			mockMemoryRecordGatewayTurn.mockResolvedValueOnce([99]);
			const provider = new QuasarMemoryProvider();
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });

			const result = await provider.handleToolCall(
				"memory_record",
				{ content: "Important fact", tags: "test,fact" },
				testContext,
			);
			const parsed = JSON.parse(result);
			expect(parsed.ok).toBe(true);
			expect(mockMemoryRecordGatewayTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					dbPath: "memory/main",
					userText: "[Memory record] Important fact (tags: test,fact)",
				}),
			);
		});

		test("returns error for unknown tool", async () => {
			const provider = new QuasarMemoryProvider();
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });

			const result = await provider.handleToolCall(
				"unknown_tool",
				{},
				testContext,
			);
			const parsed = JSON.parse(result);
			expect(parsed.error).toContain("unknown_tool");
		});

		test("returns error when not ready", async () => {
			const provider = new QuasarMemoryProvider();

			const result = await provider.handleToolCall(
				"memory_search",
				{ query: "test" },
				testContext,
			);
			const parsed = JSON.parse(result);
			expect(parsed.error).toContain("not available");
		});

		test("memory_record returns error on failure", async () => {
			mockMemoryRecordGatewayTurn.mockRejectedValueOnce(
				new Error("record failed"),
			);
			const provider = new QuasarMemoryProvider();
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });

			const result = await provider.handleToolCall(
				"memory_record",
				{ content: "test" },
				testContext,
			);
			const parsed = JSON.parse(result);
			expect(parsed.error).toContain("record failed");
		});
	});

	describe("shutdown", () => {
		test("resets ready state and clears client", async () => {
			const provider = new QuasarMemoryProvider();
			await provider.initialize({ threadId: "t1", workspace: "/tmp/test" });
			expect(provider.isAvailable()).toBe(true);

			await provider.shutdown();
			expect(provider.isAvailable()).toBe(false);
		});
	});

	describe("lifecycle hooks", () => {
		test("onTurnStart is a no-op", async () => {
			const provider = new QuasarMemoryProvider();
			await expect(
				provider.onTurnStart(1, "msg", testContext),
			).resolves.toBeUndefined();
		});

		test("onSessionEnd is a no-op", async () => {
			const provider = new QuasarMemoryProvider();
			await expect(
				provider.onSessionEnd([], testContext),
			).resolves.toBeUndefined();
		});

		test("onSessionSwitch is a no-op", async () => {
			const provider = new QuasarMemoryProvider();
			await expect(
				provider.onSessionSwitch({
					threadId: "t1",
					previousThreadId: "t0",
				}),
			).resolves.toBeUndefined();
		});

		test("onMemoryWrite is a no-op", async () => {
			const provider = new QuasarMemoryProvider();
			await expect(
				provider.onMemoryWrite("write", "target", "content"),
			).resolves.toBeUndefined();
		});

		test("onDelegation is a no-op", async () => {
			const provider = new QuasarMemoryProvider();
			await expect(
				provider.onDelegation("task", "result", {
					threadId: "t1",
				}),
			).resolves.toBeUndefined();
		});
	});
});
