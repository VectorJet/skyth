import type { UpdateFileChunk } from "@/gateway/builtin/tools/apply_patch/patch.ts";

export function computeReplacements(
	originalLines: string[],
	filePath: string,
	chunks: UpdateFileChunk[],
): Array<[number, number, string[]]> {
	const replacements: Array<[number, number, string[]]> = [];
	let lineIndex = 0;
	for (const chunk of chunks) {
		if (chunk.change_context) {
			const contextIdx = seekSequence(
				originalLines,
				[chunk.change_context],
				lineIndex,
			);
			if (contextIdx === -1) {
				throw new Error(
					`Failed to find context '${chunk.change_context}' in ${filePath}`,
				);
			}
			lineIndex = contextIdx + 1;
		}
		if (chunk.old_lines.length === 0) {
			const insertionIdx =
				originalLines.length > 0 &&
				originalLines[originalLines.length - 1] === ""
					? originalLines.length - 1
					: originalLines.length;
			replacements.push([insertionIdx, 0, chunk.new_lines]);
			continue;
		}
		let pattern = chunk.old_lines;
		let newSlice = chunk.new_lines;
		let found = seekSequence(
			originalLines,
			pattern,
			lineIndex,
			chunk.is_end_of_file,
		);
		if (
			found === -1 &&
			pattern.length > 0 &&
			pattern[pattern.length - 1] === ""
		) {
			pattern = pattern.slice(0, -1);
			if (newSlice.length > 0 && newSlice[newSlice.length - 1] === "") {
				newSlice = newSlice.slice(0, -1);
			}
			found = seekSequence(
				originalLines,
				pattern,
				lineIndex,
				chunk.is_end_of_file,
			);
		}
		if (found !== -1) {
			replacements.push([found, pattern.length, newSlice]);
			lineIndex = found + pattern.length;
		} else {
			throw new Error(
				`Failed to find expected lines in ${filePath}:\n${chunk.old_lines.join("\n")}`,
			);
		}
	}
	replacements.sort((a, b) => a[0] - b[0]);
	return replacements;
}

export function applyReplacements(
	lines: string[],
	replacements: Array<[number, number, string[]]>,
): string[] {
	const result = [...lines];
	for (let i = replacements.length - 1; i >= 0; i--) {
		const replacement = replacements[i];
		if (!replacement) continue;
		const [startIdx, oldLen, newSegment] = replacement;
		result.splice(startIdx, oldLen, ...newSegment);
	}
	return result;
}

function normalizeUnicode(str: string): string {
	return str
		.replace(/[‘’‚‛]/g, "'")
		.replace(/[“”„‟]/g, '"')
		.replace(/[‐‑‒–—―]/g, "-")
		.replace(/…/g, "...")
		.replace(/ /g, " ");
}

type Comparator = (a: string, b: string) => boolean;

function tryMatch(
	lines: string[],
	pattern: string[],
	startIndex: number,
	compare: Comparator,
	eof: boolean,
): number {
	if (eof) {
		const fromEnd = lines.length - pattern.length;
		if (fromEnd >= startIndex && matchesAt(lines, pattern, fromEnd, compare))
			return fromEnd;
	}
	for (let i = startIndex; i <= lines.length - pattern.length; i++) {
		if (matchesAt(lines, pattern, i, compare)) return i;
	}
	return -1;
}

function matchesAt(
	lines: string[],
	pattern: string[],
	start: number,
	compare: Comparator,
): boolean {
	for (let j = 0; j < pattern.length; j++) {
		const line = lines[start + j];
		const pat = pattern[j];
		if (line === undefined || pat === undefined || !compare(line, pat))
			return false;
	}
	return true;
}

function seekSequence(
	lines: string[],
	pattern: string[],
	startIndex: number,
	eof = false,
): number {
	if (pattern.length === 0) return -1;
	const exact = tryMatch(lines, pattern, startIndex, (a, b) => a === b, eof);
	if (exact !== -1) return exact;
	const rstrip = tryMatch(
		lines,
		pattern,
		startIndex,
		(a, b) => a.trimEnd() === b.trimEnd(),
		eof,
	);
	if (rstrip !== -1) return rstrip;
	const trim = tryMatch(
		lines,
		pattern,
		startIndex,
		(a, b) => a.trim() === b.trim(),
		eof,
	);
	if (trim !== -1) return trim;
	return tryMatch(
		lines,
		pattern,
		startIndex,
		(a, b) => normalizeUnicode(a.trim()) === normalizeUnicode(b.trim()),
		eof,
	);
}
