import type { ToolEntry } from "@/base/base_agent/tools/types";

export class FirstUseTracker {
	private readonly used = new Set<string>();

	shouldInjectSource(sessionKey: string, toolName: string): boolean {
		const key = `${sessionKey}:${toolName}`;
		if (this.used.has(key)) return false;
		this.used.add(key);
		return true;
	}

	buildFirstUseSystemMessage(tool: ToolEntry): string {
		return [
			"[TOOL SOURCE REVIEW: FIRST USE]",
			`Tool: ${tool.metadata.name}`,
			`Source: ${tool.metadata.sourcePath}`,
			"Review this tool source before execution:",
			"```",
			tool.sourceCode ?? "(source unavailable)",
			"```",
		].join("\n");
	}
}
