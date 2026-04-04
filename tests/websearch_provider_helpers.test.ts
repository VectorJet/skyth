import { describe, expect, test } from "bun:test";
import {
	formatBraveResults,
	formatSerpApiResults,
	formatSerperResults,
	pickConfiguredProviderIds,
} from "../skyth/tools/websearch/provider_helpers";

describe("websearch provider helpers", () => {
	test("formats serper results consistently", () => {
		const output = formatSerperResults(
			[{ title: "One", url: "https://a", snippet: "A" }],
			10,
		);
		expect(output).toContain("1. One");
		expect(output).toContain("https://a");
	});

	test("formats serpapi and brave results consistently", () => {
		expect(
			formatSerpApiResults(
				[{ title: "Two", link: "https://b", snippet: "B" }],
				10,
			),
		).toContain("https://b");
		expect(
			formatBraveResults(
				[{ title: "Three", url: "https://c", description: "C" }],
				10,
			),
		).toContain("https://c");
	});

	test("picks only configured providers with api keys", () => {
		const ids = pickConfiguredProviderIds({
			websearch: {
				providers: {
					exa: { api_key: "key" },
					serper: { api_key: "" },
				},
			},
		} as any);
		expect(ids).toEqual(["exa"]);
	});
});
