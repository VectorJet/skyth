/**
 * @tool exec
 * @author skyth-team
 * @version 1.0.0
 * @description Execute a shell command and return stdout/stderr.
 * @tags system, shell
 */
import { defineTool } from "@/sdks/agent-sdk/tools";
import { isDangerousCommand } from "@/security/dangerous";
import { evaluateFsPermission } from "@/security/permission";
import {
	checkCommandSafety,
	DEFAULT_SAFE_BINS,
	DEFAULT_DENY_BINS,
} from "@/security/exec-safety";
import { getRuntimeConfig } from "@/tools/global_runtime";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function guardCommand(
	command: string,
	cwd: string,
	workspaceOnly: boolean,
	safeList: string[],
	denyList: string[],
): string | undefined {
	if (isDangerousCommand(command)) {
		return "Error: Command blocked by safety guard (dangerous pattern detected)";
	}

	const safety = checkCommandSafety(command, safeList, denyList);
	if (!safety.safe) {
		return `Error: Command blocked by safety guard (${safety.reason})`;
	}

	if (workspaceOnly) {
		const pathTraversal = /\.\.[\/\\]/;
		if (pathTraversal.test(command) || pathTraversal.test(cwd)) {
			return "Error: Command blocked by safety guard (path traversal detected)";
		}
	}

	return undefined;
}

function getTimeout(): number {
	const runtime = getRuntimeConfig();
	const toolsConfig = runtime.tools as Record<string, any>;
	return toolsConfig?.exec?.timeout ?? 60;
}

function getSafeBins(): string[] {
	const runtime = getRuntimeConfig();
	const toolsConfig = runtime.tools as Record<string, any>;
	return toolsConfig?.exec?.allowlist ?? DEFAULT_SAFE_BINS;
}

function getDenyBins(): string[] {
	const runtime = getRuntimeConfig();
	const toolsConfig = runtime.tools as Record<string, any>;
	return toolsConfig?.exec?.deny ?? DEFAULT_DENY_BINS;
}

export default defineTool({
	name: "exec",
	description: "Execute a shell command and return stdout/stderr.",
	parameters: {
		type: "object",
		properties: {
			command: { type: "string" },
			working_dir: { type: "string" },
		},
		required: ["command"],
	},
	async execute(params: Record<string, any>, ctx?: any): Promise<string> {
		const command = String(params.command ?? "").trim();
		const cwd = String(params.working_dir ?? process.cwd());
		const timeout = getTimeout();

		if (!command) return "Error: command is required";

		const runtime = getRuntimeConfig();
		const fsPolicy = evaluateFsPermission(runtime);
		const workspaceOnly = fsPolicy.workspaceOnly;
		const safeList = getSafeBins();
		const denyList = getDenyBins();

		const guard = guardCommand(command, cwd, workspaceOnly, safeList, denyList);
		if (guard) return guard;

		let proc: import("bun").Subprocess | undefined;
		try {
			proc = Bun.spawn(["zsh", "-lc", command], {
				cwd,
				stdout: "pipe",
				stderr: "pipe",
			});

			const timed = Promise.race([
				proc.exited.then(async () => {
					const stdout = proc!.stdout;
					const stderr = proc!.stderr;
					const out =
						stdout && typeof stdout !== "number"
							? await new Response(stdout).text()
							: "";
					const err =
						stderr && typeof stderr !== "number"
							? await new Response(stderr).text()
							: "";
					let result = out;
					if (err.trim()) result += `${result ? "\\n" : ""}STDERR:\\n${err}`;
					if ((await proc!.exited) !== 0)
						result += `${result ? "\\n" : ""}Exit code: ${await proc!.exited}`;
					return result || "(no output)";
				}),
				(async () => {
					await sleep(timeout * 1000);
					return "__TIMEOUT__";
				})(),
			]);

			const result = await timed;
			if (result === "__TIMEOUT__") {
				proc.kill();
				return `Error: Command timed out after ${timeout} seconds`;
			}

			const text = String(result);
			return text.length > 10000
				? `${text.slice(0, 10000)}\\n... (truncated)`
				: text;
		} catch (error) {
			return `Error executing command: ${error instanceof Error ? error.message : String(error)}`;
		}
	},
});
