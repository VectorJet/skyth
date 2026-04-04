export interface AgentEntry {
	id: string;
	name: string;
	description?: string;
	emoji?: string;
	avatar?: string;
	root: string;
	manifestPath: string;
	globalTools: boolean;
}

export interface AgentsListResult {
	agents: AgentEntry[];
	total: number;
}

export interface AgentIdentityResult {
	id: string;
	name: string;
	description?: string;
	emoji?: string;
	avatar?: string;
	root: string;
	workspace: string;
}

export interface AgentFileEntry {
	name: string;
	path: string;
	missing: boolean;
	size?: number;
	updatedAtMs?: number;
}

export interface AgentsFilesListResult {
	agentId: string;
	workspace: string;
	files: AgentFileEntry[];
}

export interface AgentsFilesGetResult {
	agentId: string;
	workspace: string;
	file: AgentFileEntry & { content?: string };
}
