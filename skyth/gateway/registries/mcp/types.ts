export interface MCPManifest {
	name: string;
	description: string;
	allowedPaths: string[];
	transport?: "stdio" | "http" | "sse";
	command?: string; // Optional: custom command to run the server
	args?: string[]; // Optional: custom args for the command
	url?: string; // Required for http/sse transports
	headers?: Record<string, string>; // Optional request headers for http/sse transports
	env?: Record<string, string>; // Optional per-server env, also populated from sibling .env files
	requiredEnv?: string[]; // If any are unset, skip this server at startup
	exposeTools?: boolean; // If false, keep server callable but hide tools from discovery/listing
	packageJson?: string; // Optional: path to package.json for dependencies
	// If true, the launcher appends `allowedPaths` as positional CLI args after
	// `args`. Defaults to false because most MCP servers don't accept paths
	// positionally (e.g. chrome-devtools, context7) and would crash.
	appendAllowedPaths?: boolean;
	// Override the default connect/listTools timeouts (in ms). Useful for
	// npx-based servers whose first run downloads packages.
	startupTimeoutMs?: number;
}

export interface MCPServerInstance {
	name: string;
	manifest: MCPManifest;
	process: any; // Child process
	client: any; // MCP client
	tools: Map<string, any>;
	status: "starting" | "running" | "stopped" | "error";
}

export interface MCPRegistryOptions {
	mcpDirectory?: string;
	mcpDirectories?: string[];
	autoReload?: boolean;
}
