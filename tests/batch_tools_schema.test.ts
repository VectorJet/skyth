import { describe, expect, test } from "bun:test";
import { batchToolsTool } from "@/gateway/meta/tools/batch_tools";
import { gatewayParametersToJsonSchema } from "@/base/base_agent/tools/gateway_adapter";

describe("batch_tools schema", () => {
	test("emits provider-compatible nested call schema", () => {
		const schema = gatewayParametersToJsonSchema(batchToolsTool.parameters);
		const calls = schema.properties.calls;

		expect(schema.required).toEqual(["calls"]);
		expect(calls.items.required).toEqual(["tool"]);
		expect(calls.items.required).not.toBe(true);
		expect(calls.items.properties.tool.name).toBeUndefined();
	});
});
