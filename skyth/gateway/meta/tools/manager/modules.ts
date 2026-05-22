export interface MetaToolModules {
	find: typeof import("@/gateway/meta/tools/find_tools.ts");
	list: typeof import("@/gateway/meta/tools/list_tools.ts");
	execute: typeof import("@/gateway/meta/tools/execute_tool.ts");
	toolWatch: typeof import("@/gateway/meta/tools/tool_watch.ts");
	wait: typeof import("@/gateway/meta/tools/tool_wait.ts");
	toolResult: typeof import("@/gateway/meta/tools/tool_result.ts");
	listSkills: typeof import("@/gateway/meta/tools/list_skills.ts");
	createSkill: typeof import("@/gateway/meta/tools/create_skill.ts");
	useSkill: typeof import("@/gateway/meta/tools/use_skill.ts");
	batch: typeof import("@/gateway/meta/tools/batch_tools.ts");
	debug: typeof import("@/gateway/meta/tools/gateway_debug.ts");
	readme: typeof import("@/gateway/meta/tools/gateway_readme.ts");
	composioMeta: typeof import("@/gateway/meta/tools/composio_meta.ts");
	delegate: typeof import("@/gateway/meta/tools/delegate_tool.ts");
	task: typeof import("@/gateway/meta/tools/task_tool.ts");
}
