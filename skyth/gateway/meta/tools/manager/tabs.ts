export interface TabProfile {
	allowedTools: string[];
	allowedPipelines: string[];
	allowedMcpServers: string[];
	allowedSkills: string[];
}

export function createDefaultTabProfiles(): Map<string, TabProfile> {
	return new Map([
		[
			"chat",
			{
				allowedTools: ["*"],
				allowedPipelines: ["*"],
				allowedMcpServers: ["*"],
				allowedSkills: ["*"],
			},
		],
		[
			"code",
			{
				allowedTools: ["bash", "read", "write", "edit", "glob", "grep"],
				allowedPipelines: ["transcript", "stock_py"],
				allowedMcpServers: ["context7"],
				allowedSkills: ["*"],
			},
		],
		[
			"cowork",
			{
				allowedTools: ["bash", "read", "write", "edit", "glob", "grep"],
				allowedPipelines: ["transcript"],
				allowedMcpServers: ["chrome-devtools", "context7"],
				allowedSkills: ["*"],
			},
		],
	]);
}

export function isToolAllowedByProfile(
	toolName: string,
	profile: TabProfile,
): boolean {
	if (typeof toolName !== "string" || toolName.trim() === "") return false;
	if (toolName.startsWith("pipeline:")) {
		const pipelineName = toolName.replace("pipeline:", "");
		return (
			profile.allowedPipelines.includes("*") ||
			profile.allowedPipelines.includes(pipelineName)
		);
	}
	if (toolName.startsWith("mcp:")) {
		const mcpToolName = toolName.replace("mcp:", "");
		const serverName = mcpToolName.split("_")[0] ?? "";
		return (
			profile.allowedMcpServers.includes("*") ||
			profile.allowedMcpServers.includes(serverName)
		);
	}
	if (toolName.startsWith("skill:")) {
		const skillName = toolName.replace("skill:", "");
		return (
			profile.allowedSkills.includes("*") ||
			profile.allowedSkills.includes(skillName)
		);
	}
	return (
		profile.allowedTools.includes("*") ||
		profile.allowedTools.includes(toolName)
	);
}

export function updateTabProfileEntry(
	profiles: Map<string, TabProfile>,
	tabName: string,
	profile: Partial<TabProfile>,
): void {
	const existing = profiles.get(tabName) || {
		allowedTools: [],
		allowedPipelines: [],
		allowedMcpServers: [],
		allowedSkills: [],
	};
	profiles.set(tabName, {
		allowedTools: profile.allowedTools ?? existing.allowedTools,
		allowedPipelines: profile.allowedPipelines ?? existing.allowedPipelines,
		allowedMcpServers: profile.allowedMcpServers ?? existing.allowedMcpServers,
		allowedSkills: profile.allowedSkills ?? existing.allowedSkills,
	});
}

export function tabProfilesToRecord(
	profiles: Map<string, TabProfile>,
): Record<string, TabProfile> {
	const result: Record<string, TabProfile> = {};
	for (const [tabName, profile] of profiles.entries())
		result[tabName] = profile;
	return result;
}
