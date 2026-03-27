import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseToolMetadata } from "../skyth/base/base_agent/tools/metadata";
import { loadToolEntries } from "../skyth/base/base_agent/tools/loader";
import { FirstUseTracker } from "../skyth/base/base_agent/tools/first_use";

describe("base agent tool discovery", () => {
	test("metadata parser reads JSDoc-style tags", () => {
		const sourceCode = [
			"/**",
			" * @tool lint_tool",
			" * @description Run linter",
			" * @author skyth",
			" * @version 1.2.3",
			" */",
			"export default {}",
		].join("\n");

		const meta = parseToolMetadata({
			sourcePath: "/tmp/lint_tool.ts",
			sourceCode,
			defaultName: "lint",
			source: "workspace",
		});

		expect(meta.name).toBe("lint_tool");
		expect(meta.description).toBe("Run linter");
		expect(meta.author).toBe("skyth");
		expect(meta.version).toBe("1.2.3");
		expect(meta.source).toBe("workspace");
	});

	test("loader discovers *_tool files and parses metadata", () => {
		const root = mkdtempSync(join(tmpdir(), "skyth-tools-"));
		mkdirSync(join(root, "nested"), { recursive: true });

		writeFileSync(
			join(root, "nested", "hello_tool.ts"),
			[
				"/**",
				" * @tool hello_tool",
				" * @description Say hello",
				" */",
				"export default {}",
			].join("\n"),
			"utf-8",
		);

		writeFileSync(
			join(root, "nested", "ignore.ts"),
			"export default {}",
			"utf-8",
		);

		const entries = loadToolEntries(root, "workspace");
		expect(entries.length).toBe(1);
		expect(entries[0]?.metadata.name).toBe("hello_tool");
		expect(entries[0]?.metadata.description).toBe("Say hello");
	});

	test("first-use tracker only injects once per session/tool", () => {
		const tracker = new FirstUseTracker();

		expect(tracker.shouldInjectSource("cli:direct", "read_file")).toBeTrue();
		expect(tracker.shouldInjectSource("cli:direct", "read_file")).toBeFalse();
		expect(tracker.shouldInjectSource("cli:other", "read_file")).toBeTrue();

		const message = tracker.buildFirstUseSystemMessage({
			id: "workspace:read_file",
			metadata: {
				name: "read_file",
				description: "Read file",
				sourcePath: "/tmp/read_file_tool.ts",
				source: "workspace",
				entrypoint: "/tmp/read_file_tool.ts",
			},
			sourceCode: "export default {}",
		});

		expect(message).toContain("TOOL SOURCE REVIEW");
		expect(message).toContain("read_file");
	});

	test("global tools follow *_tool naming and include metadata headers", () => {
		const entries = loadToolEntries(
			join(process.cwd(), "skyth", "tools"),
			"global",
		);
		const byName = new Map(
			entries.map((entry) => [entry.metadata.name, entry]),
		);

		const required = ["batch", "codesearch"];

		for (const name of required) {
			const entry = byName.get(name);
			expect(entry).toBeDefined();
			expect(["skyth-team", "VectorJet"]).toContain(entry?.metadata.author);
			expect((entry?.metadata.description ?? "").length).toBeGreaterThan(5);
		}
	});
});
