/**
 * @tool exec
 * @author skyth-team
 * @version 1.0.0
 * @description Execute a shell command and return stdout/stderr.
 * @tags system, shell
 */
import { defineTool } from "@/sdks/agent-sdk/tools";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const denyPatterns: RegExp[] = [
  /\brm\s+-[rf]{1,2}\b/i,
  /\bdel\s+\/[fq]\b/i,
  /\brmdir\s+\/s\b/i,
  /\bdd\s+if=/i,
  /\b(shutdown|reboot|poweroff)\b/i,
  /:\(\)\s*\{.*\};\s*:/i,
];

function guardCommand(command: string, cwd: string, restrictToWorkspace = false): string | undefined {
  for (const pattern of denyPatterns) {
    if (pattern.test(command)) return "Error: Command blocked by safety guard";
  }
  if (restrictToWorkspace && (command.includes("../") || command.includes("..\\") || cwd.includes("../") || cwd.includes("..\\"))) {
    return "Error: Command blocked by safety guard (path traversal detected)";
  }
  return undefined;
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
    const timeout = 60;
    const restrictToWorkspace = false;

    if (!command) return "Error: command is required";

    const guard = guardCommand(command, cwd, restrictToWorkspace);
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
          const out = stdout && typeof stdout !== "number" ? await new Response(stdout).text() : "";
          const err = stderr && typeof stderr !== "number" ? await new Response(stderr).text() : "";
          let result = out;
          if (err.trim()) result += `${result ? "\\n" : ""}STDERR:\\n${err}`;
          if ((await proc!.exited) !== 0) result += `${result ? "\\n" : ""}Exit code: ${await proc!.exited}`;
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
      return text.length > 10000 ? `${text.slice(0, 10000)}\\n... (truncated)` : text;
    } catch (error) {
      return `Error executing command: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
});
