import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import type { MCPRegistry } from "@/gateway/registries/mcp/index.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";
import {
	normalizeAxToolDescriptor,
	type AxToolDescriptor,
} from "@/gateway/meta/tools/ax.ts";
import type { ExecuteToolRunners } from "@/gateway/meta/tools/execute_tool.ts";

let toolRegistry: ToolRegistry | null = null;
let pipelineRegistry: PipelineRegistry | null = null;
let mcpRegistry: MCPRegistry | null = null;
let skillRegistry: SkillRegistry | null = null;
let runners: ExecuteToolRunners | null = null;

export function setToolRegistry(registry: ToolRegistry) {
	toolRegistry = registry;
}

export function setPipelineRegistry(registry: PipelineRegistry) {
	pipelineRegistry = registry;
}

export function setMcpRegistry(registry: MCPRegistry) {
	mcpRegistry = registry;
}

export function setSkillRegistry(registry: SkillRegistry) {
	skillRegistry = registry;
}

export function setRunners(next: ExecuteToolRunners) {
	runners = next;
}

function requireRunners(): ExecuteToolRunners {
	if (!runners) throw new Error("Capability runners not initialized");
	return runners;
}

interface ToolMatch {
	name: string;
	description: string;
	summary: string;
	score: number;
	category?: string;
	visibility?: string;
	tags?: string[];
	triggerPhrases?: string[];
	relatedTools?: string[];
	whenNotToUse?: string[];
	matchedSignals?: string[];
	parameters: any[];
	source: string;
}

interface NegativeToolConstraints {
	avoid?: string[];
	excludeTools?: string[];
	excludeCategories?: string[];
	excludeTags?: string[];
	excludeSources?: string[];
}

const STOP_WORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"but",
	"by",
	"can",
	"do",
	"for",
	"from",
	"get",
	"how",
	"i",
	"in",
	"into",
	"is",
	"it",
	"me",
	"my",
	"of",
	"on",
	"or",
	"our",
	"please",
	"show",
	"that",
	"the",
	"this",
	"to",
	"use",
	"using",
	"want",
	"we",
	"what",
	"when",
	"where",
	"with",
	"you",
]);

const INTENT_SYNONYMS: Record<string, string[]> = {
	read: ["open", "inspect", "view", "load", "cat", "contents", "file"],
	search: [
		"find",
		"lookup",
		"locate",
		"grep",
		"query",
		"discover",
		"semantic",
		"bm25",
	],
	edit: ["modify", "change", "patch", "replace", "update", "fix", "write"],
	write: ["create", "save", "overwrite", "generate", "emit"],
	run: ["execute", "shell", "bash", "command", "terminal", "cli", "process"],
	test: ["check", "verify", "validate", "lint", "smoke"],
	code: [
		"repo",
		"repository",
		"source",
		"implementation",
		"typescript",
		"javascript",
	],
	memory: [
		"conversation",
		"thread",
		"session",
		"history",
		"archive",
		"rag",
		"recall",
	],
	browser: ["chrome", "page", "tab", "cef", "dom", "screenshot", "devtools"],
	async: ["background", "long", "wait", "runid", "watch", "notify"],
	tool: ["capability", "function", "mcp", "pipeline", "skill"],
	file: ["path", "folder", "directory", "filesystem", "glob"],
	telegram: ["message", "chat", "react", "send"],
};

function tokenize(text: string): string[] {
	const tokens = text
		.toLowerCase()
		.replace(/[_:/.-]+/g, " ")
		.split(/[^a-z0-9]+/)
		.map((token) => token.trim())
		.filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
	return Array.from(new Set(tokens));
}

function toStringArray(value: unknown): string[] {
	if (value == null) return [];
	if (Array.isArray(value))
		return value.map((item) => String(item).trim()).filter(Boolean);
	return [String(value).trim()].filter(Boolean);
}

function toLowerSet(values: string[]): Set<string> {
	return new Set(
		values.map((value) => value.toLowerCase().trim()).filter(Boolean),
	);
}

function expandQueryTokens(tokens: string[]): string[] {
	const expanded = new Set(tokens);
	for (const token of tokens) {
		const synonyms = INTENT_SYNONYMS[token] ?? [];
		for (const synonym of synonyms) expanded.add(synonym);
		for (const [root, values] of Object.entries(INTENT_SYNONYMS)) {
			if (values.includes(token)) expanded.add(root);
		}
	}
	return Array.from(expanded);
}

function extractNegatedText(query: string): string[] {
	const text = query.toLowerCase().replace(/[_:/.-]+/g, " ");
	const matches: string[] = [];
	const patterns = [
		/\b(?:do not|don't|dont|avoid|without|never use|not|no)\s+([^,.;!?]+)/g,
		/\b(?:instead of|rather than)\s+([^,.;!?]+)/g,
	];
	for (const pattern of patterns) {
		for (const match of text.matchAll(pattern)) {
			const phrase = String(match[1] ?? "").trim();
			if (!phrase) continue;
			const tokens = tokenize(phrase).slice(0, 5);
			if (tokens.length > 0) matches.push(tokens.join(" "));
		}
	}
	return Array.from(new Set(matches));
}

function countTokenOverlap(field: string, tokens: string[]): number {
	const fieldTokens = new Set(tokenize(field));
	let hits = 0;
	for (const token of tokens) {
		if (fieldTokens.has(token)) hits++;
	}
	return hits;
}

function addSignal(signals: string[], signal: string): void {
	if (!signals.includes(signal)) signals.push(signal);
}

function includesPhrase(text: string, phrase: string): boolean {
	const normalizedText = text.toLowerCase().replace(/\s+/g, " ");
	const normalizedPhrase = phrase.toLowerCase().replace(/\s+/g, " ").trim();
	return Boolean(normalizedPhrase && normalizedText.includes(normalizedPhrase));
}

function scoreTokenMatches(
	field: string,
	tokens: string[],
	weight: number,
	signals: string[],
	signalLabel: string,
): number {
	const fieldTokens = new Set(tokenize(field));
	let hits = 0;
	for (const token of tokens) {
		if (fieldTokens.has(token)) hits++;
	}
	if (hits > 0) addSignal(signals, `${signalLabel}:${hits}`);
	return hits * weight;
}

function scoreNegatedIntent(
	descriptor: AxToolDescriptor,
	negatedPhrases: string[],
	signals: string[],
): number {
	let penalty = 0;
	for (const phrase of negatedPhrases) {
		const phraseTokens = expandQueryTokens(tokenize(phrase));
		if (phraseTokens.length === 0) continue;

		const highSalience = [
			descriptor.name,
			descriptor.category,
			descriptor.tags.join(" "),
			descriptor.triggerPhrases.join(" "),
			descriptor.intentExamples.join(" "),
		].join(" ");
		const mediumSalience = [
			descriptor.summary,
			descriptor.commonUses.join(" "),
			descriptor.relatedTools.join(" "),
			descriptor.parameterNames.join(" "),
		].join(" ");

		const highHits = countTokenOverlap(highSalience, phraseTokens);
		const mediumHits = countTokenOverlap(mediumSalience, phraseTokens);

		if (
			includesPhrase(highSalience, phrase) ||
			highHits >= Math.min(2, phraseTokens.length)
		) {
			penalty -= 140;
			addSignal(signals, `negated-intent:${phrase}`);
			continue;
		}

		if (
			includesPhrase(mediumSalience, phrase) ||
			mediumHits >= Math.min(2, phraseTokens.length)
		) {
			penalty -= 80;
			addSignal(signals, `negated-related:${phrase}`);
		}
	}
	return penalty;
}

function scoreWhenNotToUse(
	query: string,
	queryTokens: string[],
	descriptor: AxToolDescriptor,
	signals: string[],
): number {
	let penalty = 0;
	const queryTokenSet = new Set(queryTokens);
	for (const negative of descriptor.whenNotToUse) {
		const negativeTokens = tokenize(negative);
		if (negativeTokens.length === 0) continue;
		const exactPhrase = includesPhrase(query, negative);
		const allTokensPresent = negativeTokens.every((token) =>
			queryTokenSet.has(token),
		);
		if (exactPhrase || allTokensPresent) {
			penalty -= 45;
			addSignal(signals, "negative-guidance");
		}
	}
	return penalty;
}

function isToolExplicitlyExcluded(
	descriptor: AxToolDescriptor,
	source: string | undefined,
	constraints: NegativeToolConstraints,
): boolean {
	const excludedTools = toLowerSet(constraints.excludeTools ?? []);
	const excludedCategories = toLowerSet(constraints.excludeCategories ?? []);
	const excludedTags = toLowerSet(constraints.excludeTags ?? []);
	const excludedSources = toLowerSet(constraints.excludeSources ?? []);

	if (excludedTools.has(descriptor.name.toLowerCase())) return true;
	if (excludedTools.has(descriptor.name.replace(/^.*:/, "").toLowerCase()))
		return true;
	if (excludedCategories.has(descriptor.category.toLowerCase())) return true;
	if (source && excludedSources.has(source.toLowerCase())) return true;
	if (descriptor.tags.some((tag) => excludedTags.has(tag.toLowerCase())))
		return true;
	return false;
}

function scoreTool(
	query: string,
	queryTokens: string[],
	expandedTokens: string[],
	negatedPhrases: string[],
	name: string,
	tool: any,
	constraints: NegativeToolConstraints = {},
): { score: number; descriptor: AxToolDescriptor; signals: string[] } {
	const descriptor = normalizeAxToolDescriptor(name, tool);
	const queryLower = query.toLowerCase().trim();
	const nameLower = name.toLowerCase();
	const descriptionLower = descriptor.description.toLowerCase();
	const summaryLower = descriptor.summary.toLowerCase();
	const signals: string[] = [];
	let score = 0;

	if (isToolExplicitlyExcluded(descriptor, tool.source, constraints)) {
		return { score: -10_000, descriptor, signals: ["excluded-by-parameter"] };
	}

	if (nameLower === queryLower) {
		score += 160;
		addSignal(signals, "exact-name");
	}
	if (queryLower && nameLower.includes(queryLower)) {
		score += 90;
		addSignal(signals, "name-phrase");
	}
	if (queryLower && summaryLower.includes(queryLower)) {
		score += 70;
		addSignal(signals, "summary-phrase");
	}
	if (queryLower && descriptionLower.includes(queryLower)) {
		score += 55;
		addSignal(signals, "description-phrase");
	}

	for (const phrase of descriptor.triggerPhrases) {
		if (includesPhrase(query, phrase) || includesPhrase(phrase, query)) {
			score += 90;
			addSignal(signals, "trigger-phrase");
			break;
		}
	}

	for (const phrase of descriptor.intentExamples) {
		if (includesPhrase(phrase, query) || includesPhrase(query, phrase)) {
			score += 65;
			addSignal(signals, "intent-example");
			break;
		}
	}

	score += scoreTokenMatches(name, queryTokens, 26, signals, "name-token");
	score += scoreTokenMatches(
		descriptor.summary,
		queryTokens,
		18,
		signals,
		"summary-token",
	);
	score += scoreTokenMatches(
		descriptor.description,
		queryTokens,
		12,
		signals,
		"description-token",
	);
	score += scoreTokenMatches(
		descriptor.category,
		queryTokens,
		20,
		signals,
		"category-token",
	);
	score += scoreTokenMatches(
		descriptor.tags.join(" "),
		expandedTokens,
		14,
		signals,
		"tag-token",
	);
	score += scoreTokenMatches(
		descriptor.parameterNames.join(" "),
		expandedTokens,
		12,
		signals,
		"param-name",
	);
	score += scoreTokenMatches(
		descriptor.parameterDescriptions.join(" "),
		expandedTokens,
		7,
		signals,
		"param-desc",
	);
	score += scoreTokenMatches(
		descriptor.triggerPhrases.join(" "),
		expandedTokens,
		20,
		signals,
		"trigger-token",
	);
	score += scoreTokenMatches(
		descriptor.commonUses.join(" "),
		expandedTokens,
		14,
		signals,
		"common-use",
	);
	score += scoreTokenMatches(
		descriptor.relatedTools.join(" "),
		expandedTokens,
		8,
		signals,
		"related-tool",
	);

	// Prefix/substring fallback catches names like read_many for query "read many".
	for (const token of expandedTokens) {
		if (token.length < 3) continue;
		if (nameLower.includes(token)) {
			score += 9;
			addSignal(signals, "name-substring");
		}
		if (descriptor.searchText.toLowerCase().includes(token)) {
			score += 3;
		}
	}

	score += scoreWhenNotToUse(query, queryTokens, descriptor, signals);
	score += scoreNegatedIntent(descriptor, negatedPhrases, signals);

	const hasPositiveSignal = signals.some(
		(signal) =>
			!signal.startsWith("negative-") && !signal.startsWith("negated-"),
	);
	if (hasPositiveSignal && descriptor.visibility === "always") score += 8;
	if (hasPositiveSignal && descriptor.visibility === "suggested") score += 4;
	if (descriptor.visibility === "hidden") score -= 80;
	if (descriptor.visibility === "blocked") score -= 500;

	return { score, descriptor, signals };
}

function searchTools(
	query: string,
	allTools: Map<string, any>,
	constraints: NegativeToolConstraints = {},
): ToolMatch[] {
	const queryTokens = tokenize(query);
	const expandedTokens = expandQueryTokens(queryTokens);
	const negatedPhrases = [
		...extractNegatedText(query),
		...(constraints.avoid ?? []),
	];

	const matches: ToolMatch[] = [];

	for (const [name, tool] of allTools.entries()) {
		const { score, descriptor, signals } = scoreTool(
			query,
			queryTokens,
			expandedTokens,
			negatedPhrases,
			name,
			tool,
			constraints,
		);
		const hasPositiveSignal = signals.some(
			(signal) =>
				!signal.startsWith("negative-") && !signal.startsWith("negated-"),
		);

		if (score > 0 && hasPositiveSignal) {
			matches.push({
				name,
				description: descriptor.description,
				summary: descriptor.summary,
				score,
				category: descriptor.category,
				visibility: descriptor.visibility,
				tags: descriptor.tags,
				triggerPhrases: descriptor.triggerPhrases.slice(0, 5),
				relatedTools: descriptor.relatedTools.slice(0, 8),
				whenNotToUse: descriptor.whenNotToUse.slice(0, 3),
				matchedSignals: signals,
				parameters: tool.parameters,
				source: tool.source,
			});
		}
	}

	matches.sort((a, b) => b.score - a.score);
	return matches;
}

export const findToolsTool: ToolDefinition = {
	name: "find_tools",
	description: `Find the best gateway tools for a task using AX metadata and hybrid semantic ranking.

This is the primary on-demand discovery path. Prefer this over list_tools for task-specific tool selection.
It searches names, descriptions, AX summaries, trigger phrases, tags, related tools, common uses, intent examples, parameter names/descriptions, and negative guidance.

Returned matches include compact decision context: summary, category, visibility, tags, relatedTools, whenNotToUse, matchedSignals, parameters, and source.

Use this tool to:
- Discover relevant tools for a natural-language task
- Compare likely tools before choosing execute_tool
- Execute the top match directly with execute=true when the intent is unambiguous

Examples:
- find_tools({ query: "read several related source files" })
- find_tools({ query: "patch TypeScript files after reading context" })
- find_tools({ query: "run typecheck from terminal" })
- find_tools({ query: "up-to-date library docs" })
- find_tools({ query: "transcribe a YouTube video" })
- find_tools({ query: "bash", execute: true, args: { command: "ls", description: "List files" } })`,
	parameters: [
		{
			name: "query",
			description:
				"Natural language task/query. The ranker uses AX metadata, triggers, related tools, parameters, tags, summaries, descriptions, and negative guidance.",
			type: "string",
			required: true,
		},
		{
			name: "execute",
			description:
				"If true, execute the best matching tool immediately. Use only when the top match should clearly handle the task.",
			type: "boolean",
			required: false,
		},
		{
			name: "args",
			description: "Arguments to pass to the tool if execute=true",
			type: "object",
			required: false,
		},
		{
			name: "async",
			description:
				"If true and execute=true, run the selected tool in the background and return a runId. Prefer wait(runId) for long runs.",
			type: "boolean",
			required: false,
		},
		{
			name: "limit",
			description: "Maximum number of results to return (default: 10)",
			type: "number",
			required: false,
		},
		{
			name: "avoid",
			description:
				'Optional natural-language phrases to avoid/down-rank, e.g. ["file search", "bash", "editing files"]. Also inferred from query phrases like "not X" or "avoid X".',
			type: "array",
			required: false,
		},
		{
			name: "excludeTools",
			description:
				'Optional exact tool names to exclude from results, e.g. ["grep", "mcp:filesystem_search_files"]. Prefixless names also match prefixed tools by basename.',
			type: "array",
			required: false,
		},
		{
			name: "excludeCategories",
			description:
				'Optional categories to exclude from results, e.g. ["search", "file", "mcp"].',
			type: "array",
			required: false,
		},
		{
			name: "excludeTags",
			description:
				'Optional tags to exclude from results, e.g. ["filesystem", "grep"].',
			type: "array",
			required: false,
		},
		{
			name: "excludeSources",
			description:
				'Optional sources to exclude from results, e.g. ["mcp", "pipeline", "skill", "builtin"].',
			type: "array",
			required: false,
		},
	],
	handler: async (args) => {
		if (!toolRegistry) {
			throw new Error("Tool registry not initialized");
		}

		const {
			query,
			execute = false,
			args: toolArgs = {},
			async = false,
			limit = 10,
			avoid,
			excludeTools,
			excludeCategories,
			excludeTags,
			excludeSources,
			_tabContext,
		} = args;
		const constraints: NegativeToolConstraints = {
			avoid: toStringArray(avoid),
			excludeTools: toStringArray(excludeTools),
			excludeCategories: toStringArray(excludeCategories),
			excludeTags: toStringArray(excludeTags),
			excludeSources: toStringArray(excludeSources),
		};

		const allTools = new Map();

		// Add builtin/custom tools
		for (const [name, registered] of toolRegistry.getAllTools().entries()) {
			// Tab-aware filtering
			if (_tabContext && !_tabContext.isToolAllowed(name)) continue;

			allTools.set(name, {
				description: registered.definition.description,
				parameters: registered.definition.parameters,
				metadata: registered.definition.metadata,
				source: registered.definition.metadata?.tags?.includes("composio")
					? "composio"
					: registered.source,
			});
		}

		// Add pipelines as tools
		if (pipelineRegistry) {
			for (const [name, registered] of pipelineRegistry
				.getAllPipelines()
				.entries()) {
				const pipelineToolName = `pipeline:${name}`;

				// Tab-aware filtering
				if (_tabContext && !_tabContext.isToolAllowed(pipelineToolName))
					continue;

				allTools.set(pipelineToolName, {
					description: `Pipeline: ${registered.definition.description}`,
					parameters: registered.definition.parameters,
					metadata: { category: "pipeline", ...registered.definition.metadata },
					source: "pipeline",
				});
			}
		}

		// Add MCP tools
		if (mcpRegistry) {
			for (const [name, { server, tool }] of mcpRegistry
				.getAllTools()
				.entries()) {
				if (server === "composio") continue;
				const mcpToolName = `mcp:${name}`;

				// Tab-aware filtering
				if (_tabContext && !_tabContext.isToolAllowed(mcpToolName)) continue;

				const params: any[] = [];
				const schema = tool.inputSchema;
				if (schema?.properties) {
					for (const [paramName, paramDef] of Object.entries(
						schema.properties,
					)) {
						const def = paramDef as any;
						params.push({
							name: paramName,
							description: def.description || "",
							type: def.type || "string",
							required: schema.required?.includes(paramName) || false,
							enum: def.enum,
						});
					}
				}
				allTools.set(mcpToolName, {
					description: tool.description,
					parameters: params,
					metadata: { category: "mcp", tags: [server] },
					source: "mcp",
				});
			}
		}

		// Add skills as executable registry entries
		if (skillRegistry) {
			for (const [name, registered] of skillRegistry.getAllSkills().entries()) {
				const skillToolName = `skill:${name}`;

				// Tab-aware filtering
				if (_tabContext && !_tabContext.isToolAllowed(skillToolName)) continue;

				allTools.set(skillToolName, {
					description: `Skill: ${registered.definition.description}`,
					parameters: [
						{
							name: "task",
							description:
								"Current task summary to bind to the loaded skill instructions",
							type: "string",
							required: false,
						},
						{
							name: "resourcePaths",
							description:
								"Optional skill-relative resource files to load with the skill",
							type: "array",
							required: false,
						},
					],
					metadata: {
						category: "skill",
						tags: ["skill", "agent-skill"],
						resources: registered.definition.resources,
						ax: registered.definition.ax,
					},
					source: "skill",
				});
			}
		}

		const matches = searchTools(query, allTools, constraints);
		const results = matches.slice(0, limit);

		if (execute && results.length > 0) {
			const bestMatch = results[0]!;

			// Tab-aware execution check
			if (_tabContext && !_tabContext.isToolAllowed(bestMatch.name)) {
				return {
					executed: false,
					tool: bestMatch.name,
					error: `Tool "${bestMatch.name}" is not available in the "${_tabContext.activeTab}" tab.`,
					matches: results,
					activeTab: _tabContext.activeTab,
				};
			}

			try {
				// MCP tool execution
				if (bestMatch.name.startsWith("mcp:")) {
					const result = await requireRunners().mcp.run(
						bestMatch.name,
						toolArgs,
					);
					return {
						executed: true,
						tool: bestMatch.name,
						result,
					};
				}

				// Pipeline execution
				if (bestMatch.name.startsWith("pipeline:")) {
					const pipelineRunner = requireRunners().pipelines;

					if (async) {
						const { runId } = await pipelineRunner.start(
							bestMatch.name,
							toolArgs,
						);
						return {
							executed: true,
							tool: bestMatch.name,
							async: true,
							runId,
							message: `Pipeline execution started. Use tool_watch("${runId}") to wait for completion or tool_result("${runId}") to check status.`,
						};
					} else {
						const run = await pipelineRunner.run(bestMatch.name, toolArgs);
						return {
							executed: true,
							tool: bestMatch.name,
							async: false,
							result: run.output,
							duration: run.duration,
						};
					}
				}

				// Skill activation
				if (bestMatch.name.startsWith("skill:")) {
					const result = await requireRunners().skills.run(
						bestMatch.name,
						toolArgs,
					);
					return {
						executed: true,
						tool: bestMatch.name,
						result,
					};
				}

				// Regular tool execution
				const result = await requireRunners().tools.run(
					bestMatch.name,
					toolArgs,
				);
				return { executed: true, tool: bestMatch.name, result };
			} catch (error: any) {
				return {
					executed: false,
					tool: bestMatch.name,
					error: error.message,
					matches: results,
				};
			}
		}

		return {
			query,
			count: results.length,
			matches: results,
			activeTab: _tabContext?.activeTab || "unknown",
		};
	},
	metadata: {
		category: "meta",
		tags: ["discovery", "search", "meta"],
		version: "1.0.0",
		author: "system",
	},
};
