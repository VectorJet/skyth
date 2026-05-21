import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { spawn } from "child_process";
import * as os from "os";
import * as path from "path";

const DEFAULT_TIMEOUT = 2 * 60 * 1000; // 2 minutes
const MAX_OUTPUT_SIZE = 50 * 1024; // 50KB

const DESCRIPTION = `Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.

Be aware: OS: ${os.platform()}, Shell: ${process.env.SHELL || "bash"}

All commands run in the current working directory by default. Use the \`workdir\` parameter if you need to run a command in a different directory. AVOID using \`cd <directory> && <command>\` patterns - use \`workdir\` instead.

IMPORTANT: This tool is for terminal operations like git, npm, docker, etc. DO NOT use it for file operations (reading, writing, editing, searching, finding files) - use the specialized tools for this instead.

Before executing the command, please follow these steps:

1. Directory Verification:
   - If the command will create new directories or files, first use \`ls\` to verify the parent directory exists and is the correct location
   - For example, before running "mkdir foo/bar", first use \`ls foo\` to check that "foo" exists and is the intended parent directory

2. Command Execution:
   - Always quote file paths that contain spaces with double quotes (e.g., rm "path with spaces/file.txt")
   - Examples of proper quoting:
     - mkdir "/Users/name/My Documents" (correct)
     - mkdir /Users/name/My Documents (incorrect - will fail)
     - python "/path/with spaces/script.py" (correct)
     - python /path/with spaces/script.py (incorrect - will fail)
   - After ensuring proper quoting, execute the command.
   - Capture the output of the command.

Usage notes:
  - The command argument is required.
  - You can specify an optional timeout in milliseconds. If not specified, commands will time out after 120000ms (2 minutes).
  - It is very helpful if you write a clear, concise description of what this command does in 5-10 words.
  - If the output exceeds limits, it will be truncated.

  - Avoid using Bash with the \`find\`, \`grep\`, \`cat\`, \`head\`, \`tail\`, \`sed\`, \`awk\`, or \`echo\` commands, unless explicitly instructed or when these commands are truly necessary for the task. Instead, always prefer using the dedicated tools for these commands:
    - File search: Use Glob (NOT find or ls)
    - Content search: Use Grep (NOT grep or rg)
    - Read files: Use Read (NOT cat/head/tail)
    - Edit files: Use Edit (NOT sed/awk)
    - Write files: Use Write (NOT echo >/cat <<EOF)
    - Communication: Output text directly (NOT echo/printf)
  - When issuing multiple commands:
    - If the commands are independent and can run in parallel, make multiple Bash tool calls in a single message.
    - If the commands depend on each other and must run sequentially, use a single Bash call with '&&' to chain them together
    - Use ';' only when you need to run commands sequentially but don't care if earlier commands fail
    - DO NOT use newlines to separate commands (newlines are ok in quoted strings)
  - AVOID using \`cd <directory> && <command>\`. Use the \`workdir\` parameter to change directories instead.`;

interface BashResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	command: string;
	workdir?: string;
	duration: number;
	truncated?: boolean;
}

async function executeCommand(
	command: string,
	workdir?: string,
	timeout: number = DEFAULT_TIMEOUT,
): Promise<BashResult> {
	const startTime = Date.now();

	return new Promise((resolve, reject) => {
		const cwd = workdir || process.cwd();
		const shell = process.platform === "win32" ? "powershell.exe" : "/bin/bash";

		const proc = spawn(
			shell,
			process.platform === "win32" ? ["-Command", command] : ["-c", command],
			{
				cwd,
				env: process.env,
				shell: false,
			},
		);

		let stdout = "";
		let stderr = "";
		let killed = false;

		const timeoutId = setTimeout(() => {
			killed = true;
			proc.kill("SIGTERM");
			setTimeout(() => {
				if (!proc.killed) {
					proc.kill("SIGKILL");
				}
			}, 5000);
		}, timeout);

		proc.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("error", (error) => {
			clearTimeout(timeoutId);
			reject(error);
		});

		proc.on("close", (code) => {
			clearTimeout(timeoutId);
			const duration = Date.now() - startTime;

			if (killed) {
				resolve({
					stdout,
					stderr: stderr + `\n\nCommand timed out after ${timeout}ms`,
					exitCode: -1,
					command,
					workdir: cwd,
					duration,
				});
				return;
			}

			let truncated = false;
			if (stdout.length > MAX_OUTPUT_SIZE) {
				stdout =
					stdout.substring(0, MAX_OUTPUT_SIZE) + "\n\n... (output truncated)";
				truncated = true;
			}
			if (stderr.length > MAX_OUTPUT_SIZE) {
				stderr =
					stderr.substring(0, MAX_OUTPUT_SIZE) + "\n\n... (output truncated)";
				truncated = true;
			}

			resolve({
				stdout,
				stderr,
				exitCode: code ?? 0,
				command,
				workdir: cwd,
				duration,
				truncated,
			});
		});
	});
}

export const bashTool: ToolDefinition = {
	name: "bash",
	description: DESCRIPTION,
	parameters: [
		{
			name: "command",
			description: "The command to execute",
			type: "string",
			required: true,
		},
		{
			name: "description",
			description:
				"Clear, concise description of what this command does in 5-10 words",
			type: "string",
			required: true,
		},
		{
			name: "timeout",
			description: "Optional timeout in milliseconds",
			type: "number",
			required: false,
		},
		{
			name: "workdir",
			description:
				"The working directory to run the command in. Defaults to the current directory.",
			type: "string",
			required: false,
		},
	],
	handler: async (args) => {
		const { command, description, timeout = DEFAULT_TIMEOUT, workdir } = args;

		try {
			const result = await executeCommand(command, workdir, timeout);
			const success = result.exitCode === 0;

			if (success) {
				// Happy path: only surface what's non-obvious or non-default
				const out: Record<string, any> = {};
				if (result.stdout) out.stdout = result.stdout;
				if (result.stderr) out.stderr = result.stderr;
				out.workdir = result.workdir;
				if (result.duration) out.duration = result.duration;
				if (result.truncated) out.truncated = true;
				return out;
			} else {
				// Error path: full context to help debug
				return {
					stdout: result.stdout,
					stderr: result.stderr,
					exitCode: result.exitCode,
					command,
					workdir: result.workdir,
					duration: result.duration,
					truncated: result.truncated || false,
				};
			}
		} catch (error: any) {
			throw new Error(`Failed to execute command: ${error.message}`);
		}
	},
	metadata: {
		category: "execution",
		tags: ["bash", "shell", "command", "terminal"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary:
				"Run shell commands for builds, tests, package scripts, and system checks.",
			visibility: "always",
			triggerPhrases: [
				"run a command",
				"execute bash",
				"run tests",
				"run build",
				"terminal command",
				"shell command",
			],
			relatedTools: ["workspace_status", "changes_summary", "tool_lint"],
			whenNotToUse: [
				"reading files",
				"editing files",
				"searching file contents",
				"finding filenames",
			],
			commonUses: [
				"Run type checks",
				"Run tests",
				"Inspect git state",
				"Start package scripts",
			],
			followUps: ["changes_summary", "tool_history"],
			intentExamples: [
				"Run bunx tsc --noEmit",
				"Run the test suite",
				"Check git status",
			],
		},
	},
};
