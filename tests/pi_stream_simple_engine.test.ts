import { afterEach, describe, expect, test } from "bun:test";
import {
	fauxAssistantMessage,
	registerFauxProvider,
} from "@earendil-works/pi-ai";
import { piStreamSimpleEngine } from "@/pi/factory";
import { toPiContext } from "@/pi/messages";

const registrations: Array<{ unregister: () => void }> = [];

afterEach(() => {
	for (const registration of registrations.splice(0)) {
		registration.unregister();
	}
});

describe("piStreamSimpleEngine", () => {
	test("streams through Pi faux provider without network credentials", async () => {
		const registration = registerFauxProvider({
			api: "faux",
			provider: "faux",
			models: [{ id: "faux-1" }],
		});
		registrations.push(registration);
		registration.setResponses([fauxAssistantMessage("hello from pi")]);

		const events: string[] = [];
		const result = await piStreamSimpleEngine({
			provider: "faux",
			model: "faux-1",
			context: toPiContext([{ role: "user", content: "hi" }]),
			onEvent(event) {
				events.push(event.type);
			},
		});

		expect(result.stopReason).toBe("stop");
		expect(result.message.content).toEqual([
			{ type: "text", text: "hello from pi" },
		]);
		expect(events).toContain("text_delta");
		expect(events).toContain("done");
	});
});
