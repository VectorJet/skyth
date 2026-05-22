import type { ToolMetadata, ToolScope } from "@/base/base_agent/tools/types";

export function parseToolMetadata(params: {
	sourcePath: string;
	sourceCode: string;
	defaultName: string;
	source: ToolScope;
}): ToolMetadata {
	const header = params.sourceCode.split("\n").slice(0, 60).join("\n");

	const readTag = (tag: string): string | undefined => {
		const match = header.match(new RegExp(`@${tag}\\s+(.+)`));
		return match?.[1]?.trim();
	};

	const name = readTag("tool") || params.defaultName;
	const description =
		readTag("description") || `Tool loaded from ${params.sourcePath}`;
	const author = readTag("author");
	const version = readTag("version");

	return {
		name,
		description,
		author,
		version,
		sourcePath: params.sourcePath,
		source: params.source,
		entrypoint: params.sourcePath,
	};
}
