import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { parseToolMetadata } from "@/base/base_agent/tools/metadata";
import type { ToolEntry, ToolScope } from "@/base/base_agent/tools/types";

const TOOL_FILE_RE = /_tool\.(ts|js|mjs|cjs|py|sh|bash)$/i;

function discoverToolFiles(root: string): string[] {
	if (!existsSync(root)) return [];
	const absRoot = resolve(root);
	const out: string[] = [];
	const stack = [absRoot];

	while (stack.length) {
		const dir = stack.pop()!;
		for (const name of readdirSync(dir)) {
			const full = join(dir, name);
			const st = statSync(full);
			if (st.isDirectory()) {
				stack.push(full);
				continue;
			}
			if (TOOL_FILE_RE.test(name)) out.push(full);
		}
	}

	return out.sort((a, b) => a.localeCompare(b));
}

function defaultToolName(path: string): string {
	const base = basename(path, extname(path));
	return base.replace(/_tool$/i, "");
}

export function loadToolEntries(root: string, source: ToolScope): ToolEntry[] {
	const files = discoverToolFiles(root);
	const entries: ToolEntry[] = [];

	for (const file of files) {
		const sourceCode = readFileSync(file, "utf-8");
		const metadata = parseToolMetadata({
			sourcePath: file,
			sourceCode,
			defaultName: defaultToolName(file),
			source,
		});

		entries.push({
			id: `${source}:${metadata.name}`,
			metadata,
			sourceCode,
		});
	}

	return entries;
}
