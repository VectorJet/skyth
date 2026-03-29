/**
 * @tool write_file
 * @author skyth-team
 * @version 1.0.0
 * @description Write content to a file path.
 * @tags filesystem, write
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { defineTool } from "@/sdks/agent-sdk/tools";
import { verifySuperuserPassword } from "@/auth/superuser";
import { evaluateFsPermission } from "@/security/permission";
import { getRuntimeConfig } from "@/tools/global_runtime";

function resolvePath(
	path: string,
	workspace?: string,
	allowedDir?: string,
): string {
	const candidate = path.startsWith("/")
		? path
		: resolve(workspace ?? process.cwd(), path);
	const finalPath = resolve(candidate);
	if (allowedDir) {
		const root = resolve(allowedDir);
		if (finalPath !== root && !finalPath.startsWith(root + sep)) {
			throw new Error(
				`Path ${path} is outside allowed directory ${allowedDir}`,
			);
		}
	}
	return finalPath;
}

function isLockedFile(path: string): boolean {
	return path.toLowerCase().endsWith(".locked.md");
}

async function requireLockedAccess(
	path: string,
	password: unknown,
): Promise<string | null> {
	if (!isLockedFile(path)) return null;
	const candidate = typeof password === "string" ? password.trim() : "";
	if (!candidate)
		return `Error: superuser_password is required for locked file access (${path})`;
	const ok = await verifySuperuserPassword(candidate);
	if (!ok)
		return `Error: invalid superuser_password for locked file access (${path})`;
	return null;
}

export default defineTool({
	name: "write_file",
	description: "Write content to a file path.",
	parameters: {
		type: "object",
		properties: {
			path: { type: "string" },
			content: { type: "string" },
			superuser_password: { type: "string" },
		},
		required: ["path", "content"],
	},
	async execute(params: Record<string, any>, ctx?: any): Promise<string> {
		const runtime = getRuntimeConfig();
		const fsPolicy = evaluateFsPermission(runtime);

		const workspace = ctx?.workspace ?? process.cwd();
		const allowedDir = fsPolicy.workspaceOnly ? workspace : undefined;

		const targetPath = resolvePath(
			String(params.path ?? ""),
			workspace,
			allowedDir,
		);

		const accessError = await requireLockedAccess(
			targetPath,
			params.superuser_password,
		);
		if (accessError) return accessError;
		const content = String(params.content ?? "");
		try {
			await mkdir(dirname(targetPath), { recursive: true });
			await writeFile(targetPath, content, "utf-8");
			return `Successfully wrote ${content.length} bytes to ${targetPath}`;
		} catch (error) {
			return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
		}
	},
});
