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

export function tokenize(text: string): string[] {
	const tokens = text
		.toLowerCase()
		.replace(/[_:/.-]+/g, " ")
		.split(/[^a-z0-9]+/)
		.map((token) => token.trim())
		.filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
	return Array.from(new Set(tokens));
}

export function toLowerSet(values: string[]): Set<string> {
	return new Set(
		values.map((value) => value.toLowerCase().trim()).filter(Boolean),
	);
}

export function expandQueryTokens(tokens: string[]): string[] {
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

export function extractNegatedText(query: string): string[] {
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
