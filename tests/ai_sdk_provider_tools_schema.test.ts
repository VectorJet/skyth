import { describe, expect, test } from "bun:test";
import { normalizeJsonSchema } from "@/providers/ai_sdk_provider_tools";

describe("normalizeJsonSchema", () => {
	test("adds default items schemas to arrays recursively", () => {
		const schema = normalizeJsonSchema({
			type: "object",
			properties: {
				names: { type: "array" },
				edits: {
					type: "array",
					items: {
						type: "object",
						properties: {
							paths: { type: "array" },
						},
					},
				},
			},
		});

		expect(schema.properties.names.items).toEqual({ type: "string" });
		expect(schema.properties.edits.items.properties.paths.items).toEqual({
			type: "string",
		});
	});
});
