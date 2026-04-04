import { describe, expect, test } from "bun:test";
import {
	classifyCiaoUnhandledRejection,
	ignoreCiaoUnhandledRejection,
} from "@/gateway/bonjour-ciao";
import {
	disarmCiaoResponder,
	waitForCiaoShutdownSettling,
} from "@/gateway/discovery";

describe("bonjour ciao handling", () => {
	test("classifies ciao shutdown cancellations", () => {
		expect(
			classifyCiaoUnhandledRejection(new Error("CIAO PROBING CANCELLED")),
		).toEqual({
			kind: "cancellation",
			formatted: "CIAO PROBING CANCELLED",
		});
	});

	test("suppresses ciao interface assertion errors", () => {
		const error = Object.assign(
			new Error(
				"Reached illegal state! IPV4 address change from defined to undefined!",
			),
			{ name: "AssertionError" },
		);

		expect(ignoreCiaoUnhandledRejection(error)).toBe(true);
	});

	test("disarms ciao responder retry entrypoints during shutdown", async () => {
		let advertiseCalls = 0;
		let announceCalls = 0;
		let probeCalls = 0;
		let republishCalls = 0;

		const responder = {
			shutdown: async () => {},
			advertiseService: async () => {
				advertiseCalls += 1;
			},
			announce: async () => {
				announceCalls += 1;
			},
			probe: async () => {
				probeCalls += 1;
			},
			republishService: async () => {
				republishCalls += 1;
			},
		};

		disarmCiaoResponder(responder);

		await responder.advertiseService?.();
		await responder.announce?.();
		await responder.probe?.();
		await responder.republishService?.();

		expect(advertiseCalls).toBe(0);
		expect(announceCalls).toBe(0);
		expect(probeCalls).toBe(0);
		expect(republishCalls).toBe(0);
	});

	test("waits a full turn for ciao shutdown cancellations to surface", async () => {
		const steps: string[] = [];

		queueMicrotask(() => {
			steps.push("microtask");
		});
		setTimeout(() => {
			steps.push("timer");
		}, 0);

		await waitForCiaoShutdownSettling();

		expect(steps).toEqual(["microtask", "timer"]);
	});
});
