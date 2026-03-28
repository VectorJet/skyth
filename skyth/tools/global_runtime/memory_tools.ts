import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BaseTool } from "@/base/tool";
import { toText } from "./utils";

export class TodoWriteTool extends BaseTool {
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

export class TodoReadTool extends BaseTool {
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

export class TaskCompatTool extends BaseTool {
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