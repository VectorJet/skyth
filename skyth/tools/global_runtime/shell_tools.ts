import { BaseTool } from "@/base/tool";
import { toText, shQuote } from "./utils";

export class BashCompatTool extends BaseTool {
	constructor(private readonly delegate: import("@/base/base_agent/tools/shell").ExecTool) {
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

export class GrepCompatTool extends BaseTool {
	constructor(private readonly delegate: import("@/base/base_agent/tools/shell").ExecTool) {
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

export class GlobCompatTool extends BaseTool {
	constructor(private readonly delegate: import("@/base/base_agent/tools/shell").ExecTool) {
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