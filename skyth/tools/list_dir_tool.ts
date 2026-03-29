/**
 * @tool list_dir
 * @author skyth-team
 * @version 1.0.0
 * @description List directory contents.
 * @tags filesystem, list
 */
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { defineTool } from "@/sdks/agent-sdk/tools";
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
		if (finalPath !== root && !finalPath.startsWith(`${root}/`)) {
			throw new Error(
				`Path ${path} is outside allowed directory ${allowedDir}`,
			);
		}
	}
	return finalPath;
}

export default defineTool({
	name: "list_dir",
	description: "List directory contents.",
	parameters: {
		type: "object",
		properties: {
			path: { type: "string" },
		},
		required: ["path"],
	},
	async execute(params: Record<string, any>, ctx?: any): Promise<string> {
		const runtime = getRuntimeConfig();
		const fsPolicy = evaluateFsPermission(runtime);

		const workspace = fsPolicy.workspaceOnly
			? (runtime.agents?.defaults?.workspace ?? process.cwd())
			: (ctx?.workspace ?? process.cwd());
		const allowedDir = fsPolicy.workspaceOnly ? workspace : undefined;

		const targetPath = resolvePath(
			String(params.path ?? ""),
			workspace,
			allowedDir,
		);

		if (fsPolicy.workspaceOnly && allowedDir) {
			const resolved = resolve(targetPath);
			const root = resolve(allowedDir);
			if (resolved !== root && !resolved.startsWith(`${root}/`)) {
				return `Error: Path ${params.path} is outside allowed workspace directory`;
			}
		}

		try {
			const items = await readdir(targetPath);
			if (!items.length) return `Directory ${targetPath} is empty`;
			return items.sort().join("\\n");
		} catch (error) {
			return `Error listing directory: ${error instanceof Error ? error.message : String(error)}`;
		}
	},
});
