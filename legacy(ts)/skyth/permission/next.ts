export type PermissionNext = {
	evaluate(
		tool: string,
		pattern: string,
		permission: any,
	): { action: "allow" | "deny" | "prompt" };
};

export const PermissionNext = {
	evaluate(
		_tool: string,
		_pattern: string,
		_permission: any,
	): { action: "allow" | "deny" | "prompt" } {
		return { action: "allow" as const };
	},
};
