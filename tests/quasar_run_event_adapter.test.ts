import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { RunEvent } from "@/core/events";

const mockRunEventRecord = mock(() => Promise.resolve(1));
const mockWriteText = mock(() => Promise.resolve(0));
const mockOpenDb = mock(() => Promise.resolve());

const mockQuasarClient = {
	runEventRecord: mockRunEventRecord,
	writeText: mockWriteText,
	openDb: mockOpenDb,
};

mock.module("@/quasar/client", () => ({
	getQuasarClient: () => mockQuasarClient,
	QuasarClient: class {},
}));

const { QuasarRunEventAdapter } = await import(
	"@/gateway/durable/quasar-adapters"
);

describe("QuasarRunEventAdapter", () => {
	beforeEach(() => {
		mockRunEventRecord.mockClear();
		mockWriteText.mockClear();
		mockOpenDb.mockClear();
	});

	test("records a run_start event through the dedicated IPC op", async () => {
		const adapter = new QuasarRunEventAdapter();
		const event: RunEvent = {
			type: "run_start",
			threadId: "thread:1",
			runId: "run-1",
			agentId: "generalist",
		};
		await adapter.record(event);

		expect(mockWriteText).not.toHaveBeenCalled();
		expect(mockRunEventRecord).toHaveBeenCalledTimes(1);
		expect(mockRunEventRecord).toHaveBeenCalledWith({
			dbPath: expect.stringContaining("run_events.quasardb"),
			runId: "run-1",
			threadId: "thread:1",
			stepIndex: null,
			sequence: 1,
			eventType: "run_start",
			payload: event,
		});
	});

	test("records step events with their step index and an increasing sequence", async () => {
		const adapter = new QuasarRunEventAdapter();
		await adapter.record({
			type: "step_start",
			runId: "run-2",
			stepIndex: 0,
		});
		await adapter.record({
			type: "model_complete",
			runId: "run-2",
			stepIndex: 0,
			text: "done",
		});

		expect(mockWriteText).not.toHaveBeenCalled();
		expect(mockRunEventRecord).toHaveBeenCalledTimes(2);
		const firstCall = mockRunEventRecord.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		const secondCall = mockRunEventRecord.mock.calls[1]?.[0] as Record<
			string,
			unknown
		>;
		expect(firstCall.sequence).toBe(1);
		expect(firstCall.stepIndex).toBe(0);
		expect(firstCall.eventType).toBe("step_start");
		expect(secondCall.sequence).toBe(2);
		expect(secondCall.eventType).toBe("model_complete");
	});

	test("warning events without runId fall back to 'unknown'", async () => {
		const adapter = new QuasarRunEventAdapter();
		await adapter.record({ type: "warning", message: "boot diagnostic" });
		const call = mockRunEventRecord.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(call.runId).toBe("unknown");
		expect(call.threadId).toBeNull();
		expect(call.stepIndex).toBeNull();
		expect(call.eventType).toBe("warning");
	});
});
