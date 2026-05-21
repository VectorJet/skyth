import * as path from "path";
import {
	applyReplacements,
	computeReplacements,
} from "@/gateway/builtin/tools/apply_patch/replacements.ts";

// Core types for Patching
export interface Hunk {
	type: "add" | "delete" | "update";
	path: string;
	contents?: string;
	move_path?: string;
	chunks?: UpdateFileChunk[];
}

export interface UpdateFileChunk {
	old_lines: string[];
	new_lines: string[];
	change_context?: string;
	is_end_of_file?: boolean;
}

// Parser implementation
function parsePatchHeader(
	lines: string[],
	startIdx: number,
): { filePath: string; movePath?: string; nextIdx: number } | null {
	const line = lines[startIdx];
	if (!line) return null;

	if (line.startsWith("*** Add File:")) {
		const filePath = line.slice("*** Add File:".length).trim();
		return filePath ? { filePath, nextIdx: startIdx + 1 } : null;
	}

	if (line.startsWith("*** Delete File:")) {
		const filePath = line.slice("*** Delete File:".length).trim();
		return filePath ? { filePath, nextIdx: startIdx + 1 } : null;
	}

	if (line.startsWith("*** Update File:")) {
		const filePath = line.slice("*** Update File:".length).trim();
		let movePath: string | undefined;
		let nextIdx = startIdx + 1;

		// Check for move directive
		if (nextIdx < lines.length) {
			const nextLine = lines[nextIdx];
			if (nextLine && nextLine.startsWith("*** Move to:")) {
				movePath = nextLine.slice("*** Move to:".length).trim();
				nextIdx++;
			}
		}

		return filePath ? { filePath, movePath, nextIdx } : null;
	}

	return null;
}

function parseUpdateFileChunks(
	lines: string[],
	startIdx: number,
): { chunks: UpdateFileChunk[]; nextIdx: number } {
	const chunks: UpdateFileChunk[] = [];
	let i = startIdx;

	while (i < lines.length) {
		const line = lines[i];
		if (!line || line.startsWith("***")) break;

		if (line.startsWith("@@")) {
			// Parse context line
			const contextLine = line.substring(2).trim();
			i++;

			const oldLines: string[] = [];
			const newLines: string[] = [];
			let isEndOfFile = false;

			// Parse change lines
			while (i < lines.length) {
				const changeLine = lines[i];
				if (
					!changeLine ||
					changeLine.startsWith("@@") ||
					changeLine.startsWith("***")
				)
					break;

				if (changeLine === "*** End of File") {
					isEndOfFile = true;
					i++;
					break;
				}

				if (changeLine.startsWith(" ")) {
					// Keep line - appears in both old and new
					const content = changeLine.substring(1);
					oldLines.push(content);
					newLines.push(content);
				} else if (changeLine.startsWith("-")) {
					// Remove line - only in old
					oldLines.push(changeLine.substring(1));
				} else if (changeLine.startsWith("+")) {
					// Add line - only in new
					newLines.push(changeLine.substring(1));
				}

				i++;
			}

			chunks.push({
				old_lines: oldLines,
				new_lines: newLines,
				change_context: contextLine || undefined,
				is_end_of_file: isEndOfFile || undefined,
			});
		} else {
			i++;
		}
	}

	return { chunks, nextIdx: i };
}

function parseAddFileContent(
	lines: string[],
	startIdx: number,
): { content: string; nextIdx: number } {
	let content = "";
	let i = startIdx;

	while (i < lines.length) {
		const line = lines[i];
		if (!line || line.startsWith("***")) break;

		if (line.startsWith("+")) {
			content += line.substring(1) + "\n";
		}
		i++;
	}

	// Remove trailing newline
	if (content.endsWith("\n")) {
		content = content.slice(0, -1);
	}

	return { content, nextIdx: i };
}

function stripHeredoc(input: string): string {
	// Match heredoc patterns like: cat <<'EOF'\n...\nEOF or <<EOF\n...\nEOF
	const heredocMatch = input.match(
		/^(?:cat\s+)?<<['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\1\s*$/,
	);
	if (heredocMatch && heredocMatch[2]) {
		return heredocMatch[2];
	}
	return input;
}

export function parsePatch(patchText: string): { hunks: Hunk[] } {
	const cleaned = stripHeredoc(patchText.trim());
	const lines = cleaned.split("\n");
	const hunks: Hunk[] = [];
	let i = 0;

	// Look for Begin/End patch markers
	const beginMarker = "*** Begin Patch";
	const endMarker = "*** End Patch";

	const beginIdx = lines.findIndex((line) => line.trim() === beginMarker);
	const endIdx = lines.findIndex((line) => line.trim() === endMarker);

	if (beginIdx === -1 || endIdx === -1 || beginIdx >= endIdx) {
		throw new Error("Invalid patch format: missing Begin/End markers");
	}

	// Parse content between markers
	i = beginIdx + 1;

	while (i < endIdx) {
		const line = lines[i];
		if (!line) {
			i++;
			continue;
		}

		const header = parsePatchHeader(lines, i);
		if (!header) {
			i++;
			continue;
		}

		if (line.startsWith("*** Add File:")) {
			const { content, nextIdx } = parseAddFileContent(lines, header.nextIdx);
			hunks.push({
				type: "add",
				path: header.filePath,
				contents: content,
			});
			i = nextIdx;
		} else if (line.startsWith("*** Delete File:")) {
			hunks.push({
				type: "delete",
				path: header.filePath,
			});
			i = header.nextIdx;
		} else if (line.startsWith("*** Update File:")) {
			const { chunks, nextIdx } = parseUpdateFileChunks(lines, header.nextIdx);
			hunks.push({
				type: "update",
				path: header.filePath,
				move_path: header.movePath,
				chunks,
			});
			i = nextIdx;
		} else {
			i++;
		}
	}

	return { hunks };
}

export function deriveNewContentsFromChunks(
	filePath: string,
	chunks: UpdateFileChunk[],
	originalText: string,
): { content: string } {
	const originalLines = originalText.split("\n");

	// Drop trailing empty element for consistent line counting
	if (
		originalLines.length > 0 &&
		originalLines[originalLines.length - 1] === ""
	) {
		originalLines.pop();
	}

	const replacements = computeReplacements(originalLines, filePath, chunks);
	const newLines = applyReplacements(originalLines, replacements);

	// Ensure trailing newline
	if (newLines.length === 0 || newLines[newLines.length - 1] !== "") {
		newLines.push("");
	}

	return {
		content: newLines.join("\n"),
	};
}
