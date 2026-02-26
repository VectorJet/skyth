import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Tool } from "@/agents/generalist_agent/tools/base";
import { verifySuperuserPassword } from "@/agents/generalist_agent/../../auth/superuser";

function resolvePath(path: string, workspace?: string, allowedDir?: string): string {
  const candidate = path.startsWith("/") ? path : resolve(workspace ?? process.cwd(), path);
  const finalPath = resolve(candidate);
  if (allowedDir) {
    const root = resolve(allowedDir);
    if (finalPath !== root && !finalPath.startsWith(`${root}/`)) {
      throw new Error(`Path ${path} is outside allowed directory ${allowedDir}`);
    }
  }
  return finalPath;
}

function isLockedFile(path: string): boolean {
  return path.toLowerCase().endsWith(".locked.md");
}

async function requireLockedAccess(path: string, password: unknown): Promise<string | null> {
  if (!isLockedFile(path)) return null;
  const candidate = typeof password === "string" ? password.trim() : "";
  if (!candidate) return `Error: superuser_password is required for locked file access (${path})`;
  const ok = await verifySuperuserPassword(candidate);
  if (!ok) return `Error: invalid superuser_password for locked file access (${path})`;
  return null;
}

export class ReadFileTool extends Tool {
  constructor(private readonly workspace?: string, private readonly allowedDir?: string) {
    super();
  }

  get name(): string { return "read_file"; }
  get description(): string { return "Read file content from a path."; }
  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        path: { type: "string" },
        superuser_password: { type: "string" },
      },
      required: ["path"],
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const path = resolvePath(String(params.path ?? ""), this.workspace, this.allowedDir);
    const accessError = await requireLockedAccess(path, params.superuser_password);
    if (accessError) return accessError;
    try {
      const s = await stat(path);
      if (!s.isFile()) return `Error: Not a file: ${path}`;
      return await readFile(path, "utf-8");
    } catch (error) {
      return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

export class WriteFileTool extends Tool {
  constructor(private readonly workspace?: string, private readonly allowedDir?: string) {
    super();
  }

  get name(): string { return "write_file"; }
  get description(): string { return "Write content to a file path."; }
  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        superuser_password: { type: "string" },
      },
      required: ["path", "content"],
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const path = resolvePath(String(params.path ?? ""), this.workspace, this.allowedDir);
    const accessError = await requireLockedAccess(path, params.superuser_password);
    if (accessError) return accessError;
    const content = String(params.content ?? "");
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf-8");
      return `Successfully wrote ${content.length} bytes to ${path}`;
    } catch (error) {
      return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

export class EditFileTool extends Tool {
  constructor(private readonly workspace?: string, private readonly allowedDir?: string) {
    super();
  }

  get name(): string { return "edit_file"; }
  get description(): string { return "Replace old_text with new_text in a file."; }
  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
        superuser_password: { type: "string" },
      },
      required: ["path", "old_text", "new_text"],
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const path = resolvePath(String(params.path ?? ""), this.workspace, this.allowedDir);
    const accessError = await requireLockedAccess(path, params.superuser_password);
    if (accessError) return accessError;
    const oldText = String(params.old_text ?? "");
    const newText = String(params.new_text ?? "");
    try {
      const content = await readFile(path, "utf-8");
      if (!content.includes(oldText)) return `Error: old_text not found in ${path}`;
      const count = content.split(oldText).length - 1;
      if (count > 1) return `Warning: old_text appears ${count} times. Provide more context.`;
      await writeFile(path, content.replace(oldText, newText), "utf-8");
      return `Successfully edited ${path}`;
    } catch (error) {
      return `Error editing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

export class ListDirTool extends Tool {
  constructor(private readonly workspace?: string, private readonly allowedDir?: string) {
    super();
  }

  get name(): string { return "list_dir"; }
  get description(): string { return "List directory contents."; }
  get parameters(): Record<string, any> {
    return { type: "object", properties: { path: { type: "string" } }, required: ["path"] };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const path = resolvePath(String(params.path ?? ""), this.workspace, this.allowedDir);
    try {
      const items = await readdir(path);
      if (!items.length) return `Directory ${path} is empty`;
      return items.sort().join("\n");
    } catch (error) {
      return `Error listing directory: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
