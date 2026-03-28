export function sanitizeConfigInput(data: any): any {
	const listStringKeys = new Set([
		"allow_from",
		"allowFrom",
		"group_allow_from",
		"groupAllowFrom",
		"sessions",
		"panels",
	]);
	const walk = (value: any, key?: string): any => {
		if (Array.isArray(value)) {
			const items = value.map((v) => walk(v));
			return key && listStringKeys.has(key) ? items.map(String) : items;
		}
		if (value && typeof value === "object") {
			return Object.fromEntries(
				Object.entries(value).map(([k, v]) => [k, walk(v, k)]),
			);
		}
		return value;
	};
	return walk(data);
}

export function migrateConfig(data: any): any {
	const tools = data.tools ?? {};
	const execCfg = tools.exec ?? {};
	if (
		execCfg.restrictToWorkspace !== undefined &&
		tools.restrictToWorkspace === undefined
	) {
		tools.restrictToWorkspace = execCfg.restrictToWorkspace;
		delete execCfg.restrictToWorkspace;
	}
	if (tools.mcp_servers && !tools.mcpServers) {
		tools.mcpServers = tools.mcp_servers;
		delete tools.mcp_servers;
	}
	data.tools = tools;
	return data;
}