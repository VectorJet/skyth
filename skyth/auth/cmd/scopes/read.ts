export interface ReadScope {
	kind: "read";
	description: "Read-only access to Skyth";
}

export const READ_SCOPE: ReadScope = {
	kind: "read",
	description: "Read-only access to Skyth",
};

export function hasReadScope(scopes: string[]): boolean {
	return scopes.includes("read") || scopes.includes("admin");
}
