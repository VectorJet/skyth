import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { Tool } from "@/base/base_agent/tools/base";
import { ToolRegistry } from "@/base/base_agent/tools/registry";
import { createGlobalTools } from "@/tools/global_runtime";

const TOOL_SCRIPT_EXTENSIONS = new Set([
  ".py",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".sh",
  ".bash",
  ".rb",
  ".php",
  ".pl",
  ".lua",
  ".ps1",
]);

function isExecutable(stats: { mode: number }): boolean {
  return (stats.mode & 0o111) !== 0;
}

function sanitizeToolName(input: string): string {
  const value = input.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  return value || "workspace_tool";
}

function inferCommand(entrypoint: string): { command: string; args: string[] } {
  const ext = extname(entrypoint).toLowerCase();
  if (ext === ".py") return { command: "python3", args: [entrypoint] };
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs" || ext === ".ts") {
    return { command: "bun", args: ["run", entrypoint] };
  }
  if (ext === ".sh" || ext === ".bash") return { command: "bash", args: [entrypoint] };
  if (ext === ".rb") return { command: "ruby", args: [entrypoint] };
  if (ext === ".php") return { command: "php", args: [entrypoint] };
  if (ext === ".pl") return { command: "perl", args: [entrypoint] };
  if (ext === ".lua") return { command: "lua", args: [entrypoint] };
  if (ext === ".ps1") return { command: "pwsh", args: ["-File", entrypoint] };
  return { command: entrypoint, args: [] };
}

function listWorkspaceToolScripts(toolsRoot: string): string[] {
  if (!existsSync(toolsRoot) || !statSync(toolsRoot).isDirectory()) return [];
  const output: string[] = [];
  const stack = [resolve(toolsRoot)];

  while (stack.length) {
    const dir = stack.pop()!;
    const children = readdirSync(dir).sort();
    for (const child of children) {
      const abs = join(dir, child);
      const s = statSync(abs);
      if (s.isDirectory()) {
        stack.push(abs);
        continue;
      }
      const ext = extname(abs).toLowerCase();
      if (!TOOL_SCRIPT_EXTENSIONS.has(ext) && !isExecutable(s)) continue;
      output.push(abs);
    }
  }

  return output.sort((a, b) => a.localeCompare(b));
}

class WorkspaceCommandTool extends Tool {
  constructor(
    private readonly toolName: string,
    private readonly entrypoint: string,
    private readonly timeoutMs = 60_000,
  ) {
    super();
  }

  get name(): string { return this.toolName; }

  get description(): string {
    return `Execute workspace tool script: ${this.entrypoint}`;
  }

  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        input: { type: "string" },
        args: { type: "array", items: { type: "string" } },
        params: { type: "object" },
      },
    };
  }

  async execute(params: Record<string, any>): Promise<string> {
    const inferred = inferCommand(this.entrypoint);
    const extraArgs = Array.isArray(params.args) ? params.args.map((item) => String(item)) : [];
    const spawnArgs = [...inferred.args, ...extraArgs];
    const env = {
      ...process.env,
      SKYTH_TOOL_INPUT: typeof params.input === "string" ? params.input : "",
      SKYTH_TOOL_PARAMS: JSON.stringify(params.params ?? params),
    };

    let proc: Bun.Subprocess;
    try {
      proc = Bun.spawn([inferred.command, ...spawnArgs], {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
        env,
      });
      if (proc.stdin && typeof proc.stdin !== "number") {
        proc.stdin.write(JSON.stringify(params));
        proc.stdin.end();
      }
    } catch (error) {
      return `Error starting workspace tool '${this.toolName}': ${error instanceof Error ? error.message : String(error)}`;
    }

    const timeout = new Promise<string>((resolve) => {
      const handle = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // no-op
        }
        clearTimeout(handle);
        resolve(`Error: workspace tool '${this.toolName}' timed out after ${Math.round(this.timeoutMs / 1000)}s`);
      }, this.timeoutMs);
    });

    const completed = (async () => {
      const code = await proc.exited;
      const stdout = typeof proc.stdout === "number" ? "" : await new Response(proc.stdout).text();
      const stderr = typeof proc.stderr === "number" ? "" : await new Response(proc.stderr).text();
      let out = stdout.trim();
      if (!out) out = stderr.trim();
      if (!out) out = `Tool '${this.toolName}' completed with exit code ${code}`;
      if (code !== 0) {
        const err = stderr.trim() || `exit code ${code}`;
        return `Error running workspace tool '${this.toolName}': ${err}`;
      }
      return out;
    })();

    return await Promise.race([completed, timeout]);
  }
}

export type RuntimeToolRegistryResult = {
  diagnostics: string[];
  globalEnabled: boolean;
  globalTools: number;
  workspaceTools: number;
};

export async function registerRuntimeTools(params: {
  registry: ToolRegistry;
  workspace: string;
  allowedDir?: string;
  execTimeout: number;
  restrictToWorkspace: boolean;
  spawnTask: (task: string, label?: string) => Promise<string>;
  globalToolsEnabled: boolean;
}): Promise<RuntimeToolRegistryResult> {
  const diagnostics: string[] = [];
  const globalEnabled = params.globalToolsEnabled;

  let globalTools = 0;
  if (globalEnabled) {
    const tools = createGlobalTools({
      workspace: params.workspace,
      allowedDir: params.allowedDir,
      execTimeout: params.execTimeout,
      restrictToWorkspace: params.restrictToWorkspace,
      spawnTask: params.spawnTask,
    });
    for (const tool of tools) {
      params.registry.register(tool, "global");
      globalTools += 1;
    }
  }

  let workspaceTools = 0;
  const toolsRoot = join(params.workspace, "tools");
  const scripts = listWorkspaceToolScripts(toolsRoot);
  const usedNames = new Set(params.registry.toolNames);
  for (const scriptPath of scripts) {
    const rel = scriptPath.startsWith(`${toolsRoot}/`) ? scriptPath.slice(toolsRoot.length + 1) : basename(scriptPath);
    const base = basename(scriptPath, extname(scriptPath));
    const parent = basename(resolve(scriptPath, ".."));
    const candidate = sanitizeToolName(base === "tool" || base === "main" || base === "run" ? parent : base);
    const name = usedNames.has(candidate) ? sanitizeToolName(`${candidate}_${workspaceTools + 1}`) : candidate;
    usedNames.add(name);

    try {
      if (TOOL_SCRIPT_EXTENSIONS.has(extname(scriptPath).toLowerCase())) {
        const preview = await readFile(scriptPath, "utf-8");
        if (!preview.trim()) {
          diagnostics.push(`[tools] skipped empty tool script: ${rel}`);
          continue;
        }
      }
      params.registry.register(new WorkspaceCommandTool(name, scriptPath), "workspace");
      workspaceTools += 1;
    } catch (error) {
      diagnostics.push(`[tools] failed to load ${rel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    diagnostics,
    globalEnabled,
    globalTools,
    workspaceTools,
  };
}
