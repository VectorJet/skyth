import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";
import * as path from "path";

interface ReadmeSection {
	key: string;
	category: string;
	categoryKey: string;
	title: string;
	body: string;
	filePath?: string;
	updatedAt?: string;
}

const README_DIR = path.resolve(
	process.cwd(),
	"src",
	"meta",
	"support",
	"readmes",
);
const DEFAULT_CATEGORY = "General";

const FALLBACK_SECTIONS: Record<string, { title: string; body: string }> = {
	overview: {
		title: "Gateway Overview",
		body: `Claude Gateway is a local capability layer behind claude.ai. It exposes meta-tools, runtime tools, pipelines, skills, MCP servers, memory/search helpers, and connected integrations.

Use gateway_readme with list=true for documentation categories, find_tools for task-specific discovery, list_tools for inventory, execute_tool for exact execution, and wait/tool_result for async work.

Detailed hot-reloadable documentation normally lives in src/meta/support/readmes/*.md.`,
	},
	"making-tools": {
		title: "Making Tools",
		body: "Create tools as directories with manifest.json plus index.ts or index.py under the workspace TOOLS source unless modifying builtin gateway source. Add AX metadata, declare permissions, check hooks, then smoke-test through execute_tool.",
	},
	"making-pipelines": {
		title: "Making Pipelines",
		body: "Create pipelines for multi-step or long-running workflows under workspace PIPELINES unless modifying builtin gateway source. Run them through execute_tool with pipeline:<name> and use async run helpers for long work.",
	},
	"mcp-servers": {
		title: "MCP Servers",
		body: "Add MCP servers under workspace MCP unless changing builtin integrations. Each server needs a manifest.json with name, description, allowedPaths, and transport configuration. Use requiredEnv for dynamic secrets.",
	},
};

function titleFromMarkdown(markdown: string, fallback: string): string {
	const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
	return heading || fallback;
}

function titleFromKey(key: string): string {
	return key
		.split(/[-_]+/g)
		.filter(Boolean)
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
		.join(" ");
}

function normalizeKey(raw: string): string {
	return raw.trim().replace(/\.md$/i, "").toLowerCase().replace(/\\/g, "/");
}

function slugify(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/['"]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

async function listMarkdownFiles(
	dir: string,
	relativeRoot = "",
): Promise<string[]> {
	let entries: Array<{
		name: string;
		isDirectory(): boolean;
		isFile(): boolean;
	}>;
	try {
		entries = (await fs.readdir(dir, { withFileTypes: true })).map((entry) => ({
			name: String(entry.name),
			isDirectory: () => entry.isDirectory(),
			isFile: () => entry.isFile(),
		}));
	} catch {
		return [];
	}

	const nested = await Promise.all(
		entries
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(async (entry) => {
				const relativePath = path.join(relativeRoot, entry.name);
				const absolutePath = path.join(dir, entry.name);
				if (entry.isDirectory())
					return listMarkdownFiles(absolutePath, relativePath);
				if (entry.isFile() && entry.name.endsWith(".md")) return [relativePath];
				return [];
			}),
	);
	return nested.flat();
}

async function readMarkdownSections(): Promise<Record<string, ReadmeSection>> {
	const sections: Record<string, ReadmeSection> = {};
	const entries = await listMarkdownFiles(README_DIR);

	await Promise.all(
		entries
			.sort((a, b) => a.localeCompare(b))
			.map(async (entry) => {
				const parsed = path.parse(entry);
				const category = parsed.dir
					? parsed.dir.split(path.sep)[0] || DEFAULT_CATEGORY
					: DEFAULT_CATEGORY;
				const categoryKey = slugify(category);
				const basename = normalizeKey(parsed.name);
				const key = parsed.dir ? `${categoryKey}/${basename}` : basename;
				const filePath = path.join(README_DIR, entry);
				try {
					const [body, stat] = await Promise.all([
						fs.readFile(filePath, "utf8"),
						fs.stat(filePath),
					]);
					sections[key] = {
						key,
						category,
						categoryKey,
						title: titleFromMarkdown(body, titleFromKey(key)),
						body,
						filePath,
						updatedAt: stat.mtime.toISOString(),
					};
				} catch (error: any) {
					sections[key] = {
						key,
						category,
						categoryKey,
						title: titleFromKey(key),
						body: `Failed to read ${entry}: ${error?.message || error}`,
						filePath,
					};
				}
			}),
	);

	return sections;
}

async function loadSections(): Promise<Record<string, ReadmeSection>> {
	const markdownSections = await readMarkdownSections();
	if (Object.keys(markdownSections).length > 0) return markdownSections;

	return Object.fromEntries(
		Object.entries(FALLBACK_SECTIONS).map(([key, section]) => [
			key,
			{
				key,
				category: DEFAULT_CATEGORY,
				categoryKey: slugify(DEFAULT_CATEGORY),
				title: section.title,
				body: section.body,
			},
		]),
	);
}

function sortSections(
	sections: Record<string, ReadmeSection>,
): ReadmeSection[] {
	return Object.values(sections).sort(
		(a, b) =>
			a.categoryKey.localeCompare(b.categoryKey) || a.key.localeCompare(b.key),
	);
}

function filterByCategory(
	sections: Record<string, ReadmeSection>,
	category?: unknown,
): Record<string, ReadmeSection> {
	if (typeof category !== "string" || !category.trim()) return sections;
	const requested = slugify(category);
	return Object.fromEntries(
		Object.entries(sections).filter(
			([, section]) => section.categoryKey === requested,
		),
	);
}

function categoryList(sections: Record<string, ReadmeSection>) {
	const categories = new Map<
		string,
		{ key: string; title: string; count: number }
	>();
	for (const section of Object.values(sections)) {
		const existing = categories.get(section.categoryKey);
		if (existing) {
			existing.count += 1;
		} else {
			categories.set(section.categoryKey, {
				key: section.categoryKey,
				title: section.category,
				count: 1,
			});
		}
	}
	return [...categories.values()].sort((a, b) => a.key.localeCompare(b.key));
}

async function sectionList(category?: unknown) {
	const sections = filterByCategory(await loadSections(), category);
	return sortSections(sections).map((section) => ({
		key: section.key,
		category: section.category,
		categoryKey: section.categoryKey,
		title: section.title,
		updatedAt: section.updatedAt,
	}));
}

export const gatewayReadmeTool: ToolDefinition = {
	name: "gateway_readme",
	description:
		"Read detailed, hot-reloadable documentation for Claude Gateway usage. Documentation is loaded from src/meta/support/readmes/**.md on every call; use list=true to see sections, category to scope by folder, read a section by key, or readall=true to return sections.",
	parameters: [
		{
			name: "list",
			description: "If true, list available documentation section keys.",
			type: "boolean",
			required: false,
		},
		{
			name: "category",
			description:
				"Optional category folder to list or read, such as Getting Started, Tool Surfaces, Self Improvement, Debugging, Human in the Loop, Proactivity, or Hooks.",
			type: "string",
			required: false,
		},
		{
			name: "read",
			description:
				"Section key to read, such as getting-started/overview, tool-surfaces/making-tools, debugging/debugging-gateway, or hooks/hooks-and-validation. Basenames also work when unambiguous.",
			type: "string",
			required: false,
		},
		{
			name: "readall",
			description:
				"If true, return all available README sections, or all sections in category when category is provided.",
			type: "boolean",
			required: false,
		},
	],
	handler: async (args) => {
		const allSections = await loadSections();
		const sections = filterByCategory(allSections, args.category);
		const key = typeof args.read === "string" ? normalizeKey(args.read) : "";

		if (args.readall === true) {
			return {
				sections: sortSections(sections).map((section, index) => ({
					index: index + 1,
					key: section.key,
					category: section.category,
					categoryKey: section.categoryKey,
					title: section.title,
					body: section.body,
					filePath: section.filePath,
					updatedAt: section.updatedAt,
				})),
				readmeDir: README_DIR,
				count: Object.keys(sections).length,
				categories: categoryList(allSections),
			};
		}

		if (key) {
			const firstPart = key.split("/")[0] || "";
			const normalizedDirectKey = key.includes("/")
				? `${slugify(firstPart)}/${key.split("/").slice(1).join("/")}`
				: key;
			const matches = Object.values(sections).filter(
				(section) =>
					section.key === normalizedDirectKey ||
					section.key.endsWith(`/${key}`),
			);
			const section =
				matches.length === 1 ? matches[0] : sections[normalizedDirectKey];
			if (!section) {
				return {
					sections: await sectionList(args.category),
					readmeDir: README_DIR,
					categories: categoryList(allSections),
					message: `Unknown gateway_readme section "${key}". Use list=true to inspect available sections. Add or edit Markdown files in src/meta/support/readmes/<category> for hot-reloaded documentation.`,
				};
			}
			return {
				key: section.key,
				category: section.category,
				categoryKey: section.categoryKey,
				title: section.title,
				body: section.body,
				filePath: section.filePath,
				updatedAt: section.updatedAt,
			};
		}

		return {
			sections: await sectionList(args.category),
			categories: categoryList(allSections),
			readmeDir: README_DIR,
			usage:
				"Call gateway_readme with read set to a section key for details, readall=true for every section, or readall=true plus category for one folder. Add or edit .md files under readmeDir; changes are picked up on the next call.",
		};
	},
	metadata: {
		category: "documentation",
		tags: ["gateway", "readme", "docs", "help", "hot-reload"],
		visibility: "always",
		version: "2.0.0",
		author: "system",
		ax: {
			summary:
				"Hot-reloadable categorized Claude Gateway documentation for agents.",
			category: "documentation",
			visibility: "always",
			triggerPhrases: [
				"gateway readme",
				"how to use gateway",
				"gateway docs",
				"what are gateway tools",
				"how do I make a gateway tool",
				"gateway pipeline instructions",
			],
			relatedTools: [
				"find_tools",
				"list_tools",
				"execute_tool",
				"gateway_debug",
			],
			commonUses: [
				"Learn gateway concepts",
				"Choose tools vs pipelines vs skills",
				"Understand workspace versus user space",
				"Create tools, pipelines, MCP servers, and debug gateway behavior",
			],
		},
	},
};
