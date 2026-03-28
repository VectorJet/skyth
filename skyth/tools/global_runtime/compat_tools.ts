import { BaseTool } from "@/base/tool";
import { toText } from "./utils";

export { toText };

export class ReadCompatTool extends BaseTool {
	constructor(private readonly delegate: import("@/base/base_agent/tools/filesystem").ReadFileTool) {
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

export class WriteCompatTool extends BaseTool {
	constructor(private readonly delegate: import("@/base/base_agent/tools/filesystem").WriteFileTool) {
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

export class EditCompatTool extends BaseTool {
	constructor(private readonly delegate: import("@/base/base_agent/tools/filesystem").EditFileTool) {
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

export class ListCompatTool extends BaseTool {
	constructor(private readonly delegate: import("@/base/base_agent/tools/filesystem").ListDirTool) {
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