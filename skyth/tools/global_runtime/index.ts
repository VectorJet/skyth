import { BaseTool } from "@/base/tool";
import {
	EditFileTool,
	ListDirTool,
	ReadFileTool,
	WriteFileTool,
} from "@/base/base_agent/tools/filesystem";
import { ExecTool } from "@/base/base_agent/tools/shell";
import { WebFetchTool } from "@/base/base_agent/tools/web";
import { Config } from "@/config/schema";

// Import tool classes from modular files
import {
	ReadCompatTool,
	WriteCompatTool,
	EditCompatTool,
	ListCompatTool,
	toText,
} from "./compat_tools";

import { BashCompatTool, GrepCompatTool, GlobCompatTool } from "./shell_tools";

import { WebSearchCompatTool, WebFetchCompatTool } from "./web_tools";

import { TodoWriteTool, TodoReadTool, TaskCompatTool } from "./memory_tools";

// Re-export all tool classes
export {
	ReadCompatTool,
	WriteCompatTool,
	EditCompatTool,
	ListCompatTool,
	toText,
	BashCompatTool,
	GrepCompatTool,
	GlobCompatTool,
	WebSearchCompatTool,
	WebFetchCompatTool,
	TodoWriteTool,
	TodoReadTool,
	TaskCompatTool,
};

// Runtime config - need to define here since it's module-scoped state
let runtimeConfig: Config | undefined;

export function setRuntimeConfig(config: Config): void {
	runtimeConfig = config;
}

export function getRuntimeConfig(): Config {
	return runtimeConfig ?? new Config();
}

export function createGlobalTools(params: {
	workspace: string;
	allowedDir?: string;
	execTimeout: number;
	restrictToWorkspace: boolean;
	spawnTask: (task: string, label?: string) => Promise<string>;
}): BaseTool[] {
	const readFile = new ReadFileTool(params.workspace, params.allowedDir);
	const writeFile = new WriteFileTool(params.workspace, params.allowedDir);
	const editFile = new EditFileTool(params.workspace, params.allowedDir);
	const listDir = new ListDirTool(params.workspace, params.allowedDir);
	const exec = new ExecTool(
		params.execTimeout,
		params.workspace,
		undefined,
		params.restrictToWorkspace,
	);
	const webFetch = new WebFetchTool();

	return [
		new BashCompatTool(exec),
		new ReadCompatTool(readFile),
		new WriteCompatTool(writeFile),
		new EditCompatTool(editFile),
		new ListCompatTool(listDir),
		new GrepCompatTool(exec),
		new GlobCompatTool(exec),
		new WebSearchCompatTool(),
		new WebFetchCompatTool(webFetch),
		new TodoWriteTool(params.workspace),
		new TodoReadTool(params.workspace),
		new TaskCompatTool(params.spawnTask),
	];
}
