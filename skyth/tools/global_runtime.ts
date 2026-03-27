import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BaseTool } from "@/base/tool";
import {
	EditFileTool,
	ListDirTool,
	ReadFileTool,
	WriteFileTool,
} from "@/base/base_agent/tools/filesystem";
import { ExecTool } from "@/base/base_agent/tools/shell";
import { WebFetchTool } from "@/base/base_agent/tools/web";
import { WebSearchTool } from "@/tools/websearch_tool";
import { Config } from "@/config/schema";

let runtimeConfig: Config | undefined;

export function setRuntimeConfig(config: Config): void {
	runtimeConfig = config;
}

export function getRuntimeConfig(): Config {
	return runtimeConfig ?? new Config();
}

function toText(value: unknown): string {
	if (typeof value === "string") return value;
	if (value === null || value === undefined) return "";
	return String(value);
}

function shQuote(value: string): string {
	return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

class ReadCompatTool extends BaseTool {
	constructor(private readonly delegate: ReadFileTool) {
		super();
	}
	get name(): string {
		return "read";
	}
	get description(): string {
		return "Read a file from the workspace.";
	}
	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				path: { type: "string" },
				filePath: { type: "string" },
				superuser_password: { type: "string" },
			},
		};
	}
	async execute(params: Record<string, any>): Promise<string> {
		const path = toText(params.path || params.filePath).trim();
		if (!path) return "Error: path is required";
		return await this.delegate.execute({
			path,
			superuser_password: params.superuser_password,
		});
	}
}

class WriteCompatTool extends BaseTool {
	constructor(private readonly delegate: WriteFileTool) {
		super();
	}
	get name(): string {
		return "write";
	}
	get description(): string {
		return "Write a full file in the workspace.";
	}
	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				path: { type: "string" },
				filePath: { type: "string" },
				content: { type: "string" },
				superuser_password: { type: "string" },
			},
			required: ["content"],
		};
	}
	async execute(params: Record<string, any>): Promise<string> {
		const path = toText(params.path || params.filePath).trim();
		const content = toText(params.content);
		if (!path) return "Error: path is required";
		return await this.delegate.execute({
			path,
			content,
			superuser_password: params.superuser_password,
		});
	}
}

class EditCompatTool extends BaseTool {
	constructor(private readonly delegate: EditFileTool) {
		super();
	}
	get name(): string {
		return "edit";
	}
	get description(): string {
		return "Replace exact old text with new text in a file.";
	}
	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				path: { type: "string" },
				filePath: { type: "string" },
				old_text: { type: "string" },
				oldText: { type: "string" },
				new_text: { type: "string" },
				newText: { type: "string" },
				superuser_password: { type: "string" },
			},
		};
	}
	async execute(params: Record<string, any>): Promise<string> {
		const path = toText(params.path || params.filePath).trim();
		const oldText = toText(params.old_text ?? params.oldText);
		const newText = toText(params.new_text ?? params.newText);
		if (!path) return "Error: path is required";
		if (!oldText) return "Error: old_text is required";
		return await this.delegate.execute({
			path,
			old_text: oldText,
			new_text: newText,
			superuser_password: params.superuser_password,
		});
	}
}

class ListCompatTool extends BaseTool {
	constructor(private readonly delegate: ListDirTool) {
		super();
	}
	get name(): string {
		return "list";
	}
	get description(): string {
		return "List directory entries.";
	}
	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				path: { type: "string" },
			},
		};
	}
	async execute(params: Record<string, any>): Promise<string> {
		const path = toText(params.path || ".").trim() || ".";
		return await this.delegate.execute({ path });
	}
}

class BashCompatTool extends BaseTool {
	constructor(private readonly delegate: ExecTool) {
		super();
	}
	get name(): string {
		return "bash";
	}
	get description(): string {
		return "Execute a shell command in the workspace.";
	}
	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				command: { type: "string" },
				working_dir: { type: "string" },
			},
			required: ["command"],
		};
	}
	async execute(params: Record<string, any>): Promise<string> {
		const command = toText(params.command).trim();
		if (!command) return "Error: command is required";
		return await this.delegate.execute({
			command,
			working_dir: params.working_dir,
		});
	}
}

class GrepCompatTool extends BaseTool {
	constructor(private readonly delegate: ExecTool) {
		super();
	}
	get name(): string {
		return "grep";
	}
	get description(): string {
		return "Search code using ripgrep.";
	}
	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				pattern: { type: "string" },
				include: { type: "string" },
				path: { type: "string" },
			},
			required: ["pattern"],
		};
	}
	async execute(params: Record<string, any>): Promise<string> {
		const pattern = toText(params.pattern).trim();
		const include = toText(params.include).trim();
		const path = toText(params.path || ".").trim() || ".";
		if (!pattern) return "Error: pattern is required";

		const parts = ["rg", "-n", "--no-heading", "--color", "never"];
		if (include) parts.push("-g", include);
		parts.push(pattern, path);
		const cmd = parts.map((part) => shQuote(part)).join(" ");
		return await this.delegate.execute({ command: cmd });
	}
}

class GlobCompatTool extends BaseTool {
	constructor(private readonly delegate: ExecTool) {
		super();
	}
	get name(): string {
		return "glob";
	}
	get description(): string {
		return "Find files by glob pattern.";
	}
	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				pattern: { type: "string" },
				path: { type: "string" },
			},
			required: ["pattern"],
		};
	}
	async execute(params: Record<string, any>): Promise<string> {
		const pattern = toText(params.pattern).trim();
		const path = toText(params.path || ".").trim() || ".";
		if (!pattern) return "Error: pattern is required";
		const cmd = `rg --files -g ${shQuote(pattern)} ${shQuote(path)}`;
		return await this.delegate.execute({ command: cmd });
	}
}

class WebSearchCompatTool extends BaseTool {
	private delegate?: Awaited<
		ReturnType<typeof import("./websearch_tool").WebSearchTool["init"]>
	>;
	constructor() {
		super();
	}
	get name(): string {
		return "websearch";
	}
	get description(): string {
		return "Search the web for up-to-date information.";
	}
	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				query: { type: "string" },
				numResults: { type: "integer", minimum: 1, maximum: 10 },
			},
			required: ["query"],
		};
	}
	async execute(params: Record<string, any>): Promise<string> {
		if (!this.delegate) {
			const { WebSearchTool } = await import("./websearch_tool");
			this.delegate = await WebSearchTool.init();
		}
		const result = await this.delegate.execute(
			{ query: params.query, numResults: params.numResults },
			{
				sessionID: "",
				messageID: "",
				agent: "",
				abort: new AbortController().signal,
				messages: [],
				metadata: () => {},
				ask: async () => {},
			} as any,
		);
		return result.output;
	}
}

class WebFetchCompatTool extends BaseTool {
	constructor(private readonly delegate: WebFetchTool) {
		super();
	}
	get name(): string {
		return "webfetch";
	}
	get description(): string {
		return "Fetch a URL and return extracted content.";
	}
	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				url: { type: "string" },
			},
			required: ["url"],
		};
	}
	async execute(params: Record<string, any>): Promise<string> {
		return await this.delegate.execute({
			url: params.url,
			extractMode: "text",
		});
	}
}

class TodoWriteTool extends BaseTool {
	constructor(private readonly workspace: string) {
		super();
	}
	private get todoPath(): string {
		return join(this.workspace, "memory", "TODO.md");
	}
	get name(): string {
		return "todowrite";
	}
	get description(): string {
		return "Write the working todo list for this session.";
	}
	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				todos: {
					type: "array",
					items: {
						type: "object",
						properties: {
							content: { type: "string" },
							status: {
								type: "string",
								enum: ["pending", "in_progress", "completed"],
							},
						},
						required: ["content", "status"],
					},
				},
			},
			required: ["todos"],
		};
	}
	async execute(params: Record<string, any>): Promise<string> {
		const todos = Array.isArray(params.todos) ? params.todos : [];
		if (!todos.length) return "Error: todos is required";
		mkdirSync(join(this.workspace, "memory"), { recursive: true });
		const lines = ["# TODO", ""];
		for (const item of todos) {
			const status = toText(item?.status).trim();
			const content = toText(item?.content).trim();
			if (!content) continue;
			const box =
				status === "completed" ? "x" : status === "in_progress" ? ">" : " ";
			lines.push(`- [${box}] ${content}`);
		}
		lines.push("");
		writeFileSync(this.todoPath, lines.join("\n"), "utf-8");
		return `Updated TODO list with ${todos.length} item(s).`;
	}
}

class TodoReadTool extends BaseTool {
	constructor(private readonly workspace: string) {
		super();
	}
	private get todoPath(): string {
		return join(this.workspace, "memory", "TODO.md");
	}
	get name(): string {
		return "todoread";
	}
	get description(): string {
		return "Read the working todo list.";
	}
	get parameters(): Record<string, any> {
		return { type: "object", properties: {} };
	}
	async execute(): Promise<string> {
		if (!existsSync(this.todoPath)) return "TODO list is empty.";
		try {
			return readFileSync(this.todoPath, "utf-8");
		} catch (error) {
			return `Error reading TODO list: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
}

class TaskCompatTool extends BaseTool {
	constructor(
		private readonly spawnTask: (
			task: string,
			label?: string,
		) => Promise<string>,
	) {
		super();
	}
	get name(): string {
		return "task";
	}
	get description(): string {
		return "Spawn a background task for a subagent.";
	}
	get parameters(): Record<string, any> {
		return {
			type: "object",
			properties: {
				description: { type: "string" },
				prompt: { type: "string" },
			},
			required: ["prompt"],
		};
	}
	async execute(params: Record<string, any>): Promise<string> {
		const prompt = toText(params.prompt).trim();
		const description = toText(params.description).trim() || undefined;
		if (!prompt) return "Error: prompt is required";
		return await this.spawnTask(prompt, description);
	}
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
