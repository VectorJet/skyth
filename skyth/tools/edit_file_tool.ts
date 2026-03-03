/**
 * @tool edit_file
 * @author skyth-team
 * @version 1.0.0
 * @description Replace old_text with new_text in a file.
 * @tags filesystem, edit
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineTool } from "@/sdks/agent-sdk/tools";
import { verifySuperuserPassword } from "@/auth/superuser";

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

export default defineTool({
  name: "edit_file",
  description: "Replace old_text with new_text in a file.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      old_text: { type: "string" },
      new_text: { type: "string" },
      superuser_password: { type: "string" },
    },
    required: ["path", "old_text", "new_text"],
  },
  async execute(params: Record<string, any>, ctx?: any): Promise<string> {
    const workspace = ctx?.workspace ?? process.cwd();
    const allowedDir = undefined;
    const targetPath = resolvePath(String(params.path ?? ""), workspace, allowedDir);
    const accessError = await requireLockedAccess(targetPath, params.superuser_password);
    if (accessError) return accessError;
    const oldText = String(params.old_text ?? "");
    const newText = String(params.new_text ?? "");
    try {
      const content = await readFile(targetPath, "utf-8");
      if (!content.includes(oldText)) return `Error: old_text not found in ${targetPath}`;
      const count = content.split(oldText).length - 1;
      if (count > 1) return `Warning: old_text appears ${count} times. Provide more context.`;
      await writeFile(targetPath, content.replace(oldText, newText), "utf-8");
      return `Successfully edited ${targetPath}`;
    } catch (error) {
      return `Error editing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
});
