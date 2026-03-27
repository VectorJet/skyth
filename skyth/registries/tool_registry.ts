import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { Config } from "@/config/config";
import { Glob } from "@/utils/glob";
import type { ToolDefinition } from "@/sdks/agent-sdk/types";
import {
	convertLegacyToolInfo,
	isLegacyToolInfoLike,
	isToolDefinitionLike,
} from "@/base/base_agent/tools/converter";

export type ToolScope = "agent" | "global" | "workspace";

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
	if (ext === ".sh" || ext === ".bash")
		return { command: "bash", args: [entrypoint] };
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

class WorkspaceCommandTool implements ToolDefinition {
	constructor(
		public readonly name: string,
		private readonly entrypoint: string,
		private readonly timeoutMs = 60_000,
	) {}

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
		const extraArgs = Array.isArray(params.args)
			? params.args.map((item) => String(item))
			: [];
		const spawnArgs = [...inferred.args, ...extraArgs];
		const env = {
			...process.env,
			SKYTH_TOOL_INPUT: typeof params.input === "string" ? params.input : "",
			SKYTH_TOOL_PARAMS: JSON.stringify(params.params ?? params),
		};

		let proc: import("bun").Subprocess;
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
			return `Error starting workspace tool '${this.name}': ${error instanceof Error ? error.message : String(error)}`;
		}

		const timeout = new Promise<string>((resolve) => {
			const handle = setTimeout(() => {
				try {
					proc.kill();
				} catch {
					// no-op
				}
				clearTimeout(handle);
				resolve(
					`Error: workspace tool '${this.name}' timed out after ${Math.round(this.timeoutMs / 1000)}s`,
				);
			}, this.timeoutMs);
		});

		const completed = (async () => {
			const code = await proc.exited;
			const stdout =
				typeof proc.stdout === "number"
					? ""
					: await new Response(proc.stdout).text();
			const stderr =
				typeof proc.stderr === "number"
					? ""
					: await new Response(proc.stderr).text();
			let out = stdout.trim();
			if (!out) out = stderr.trim();
			if (!out) out = `Tool '${this.name}' completed with exit code ${code}`;
			if (code !== 0) {
				const err = stderr.trim() || `exit code ${code}`;
				return `Error running workspace tool '${this.name}': ${err}`;
			}
			return out;
		})();

		return await Promise.race([completed, timeout]);
	}
}

export class ToolRegistry {
	private readonly tools = new Map<string, ToolDefinition>();
	private readonly scopes = new Map<string, ToolScope>();

	async autoDiscover(
		workspaceRoot: string,
		options: { extraDirectories?: string[]; loadGlobalTools?: boolean } = {},
	): Promise<void> {
		const { AgentRegistry } = await import("@/registries/agent_registry");
		const agentRegistry = new AgentRegistry();
		agentRegistry.discoverAgents(workspaceRoot);

		const directories: string[] = [];
		if (options.loadGlobalTools !== false) {
			directories.push(join(workspaceRoot, "skyth", "tools"));
		}

		if (options.extraDirectories) {
			directories.push(...options.extraDirectories);
		}

		for (const id of agentRegistry.ids) {
			const entry = agentRegistry.get(id);
			if (entry) {
				directories.push(join(entry.root, "tools"));
			}
		}

		for (const dir of directories) {
			if (!existsSync(dir)) continue;
			const matches = Glob.scanSync("**/*_tool.{js,ts}", {
				cwd: dir,
				absolute: true,
				dot: true,
			});
			for (const match of matches) {
				try {
					const mod = await import(match);
					const defs: ToolDefinition[] = [];

					const candidates: unknown[] = [
						mod.default,
						...Object.keys(mod).map((key) => mod[key]),
					];
					for (const item of candidates) {
						if (!item) continue;
						if (isToolDefinitionLike(item)) {
							defs.push(item);
							continue;
						}
						if (isLegacyToolInfoLike(item)) {
							const converted = await convertLegacyToolInfo(item);
							defs.push(converted);
						}
					}

					for (const def of defs) {
						if (!this.tools.has(def.name)) {
							this.register(def, "global");
						}
					}
				} catch (err) {
					console.error(`Failed to auto-discover tool from ${match}:`, err);
				}
			}
		}
	}

	async autoDiscoverWorkspace(workspaceDir: string): Promise<string[]> {
		const diagnostics: string[] = [];
		let workspaceTools = 0;
		const toolsRoot = join(workspaceDir, "tools");
		const scripts = listWorkspaceToolScripts(toolsRoot);
		const usedNames = new Set(this.toolNames);

		for (const scriptPath of scripts) {
			const rel = scriptPath.startsWith(`${toolsRoot}/`)
				? scriptPath.slice(toolsRoot.length + 1)
				: basename(scriptPath);
			const base = basename(scriptPath, extname(scriptPath));
			const parent = basename(resolve(scriptPath, ".."));
			const candidate = sanitizeToolName(
				base === "tool" || base === "main" || base === "run" ? parent : base,
			);
			const name = usedNames.has(candidate)
				? sanitizeToolName(`${candidate}_${workspaceTools + 1}`)
				: candidate;
			usedNames.add(name);

			try {
				if (TOOL_SCRIPT_EXTENSIONS.has(extname(scriptPath).toLowerCase())) {
					const preview = await readFile(scriptPath, "utf-8");
					if (!preview.trim()) {
						diagnostics.push(`[tools] skipped empty tool script: ${rel}`);
						continue;
					}
				}
				this.register(new WorkspaceCommandTool(name, scriptPath), "workspace");
				workspaceTools += 1;
			} catch (error) {
				diagnostics.push(
					`[tools] failed to load ${rel}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		return diagnostics;
	}

	register(tool: ToolDefinition, scope: ToolScope = "agent"): void {
		if (!tool.name) return;
		this.tools.set(tool.name, tool);
		this.scopes.set(tool.name, scope);
	}

	unregister(name: string): void {
		this.tools.delete(name);
		this.scopes.delete(name);
	}

	get(name: string): ToolDefinition | undefined {
		return this.tools.get(name);
	}

	has(name: string): boolean {
		return this.tools.has(name);
	}

	getDefinitions(): Array<Record<string, any>> {
		return [...this.tools.values()].map((tool) => {
			// Legacy "toSchema()" support if we still have classes that extend Tool
			if ("toSchema" in tool && typeof tool.toSchema === "function") {
				return tool.toSchema();
			}
			return {
				type: "function",
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.parameters,
				},
			};
		});
	}

	async execute(
		name: string,
		params: Record<string, any>,
		context?: Record<string, any>,
	): Promise<string> {
		const tool = this.tools.get(name);
		if (!tool) return `Error: Tool '${name}' not found`;
		try {
			if (
				"validateParams" in tool &&
				typeof tool.validateParams === "function"
			) {
				const errors = tool.validateParams(params);
				if (errors && errors.length) {
					return `Error: Invalid parameters for tool '${name}': ${errors.join("; ")}`;
				}
			}
			return await tool.execute(params, context);
		} catch (error) {
			return `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	get toolNames(): string[] {
		return [...this.tools.keys()];
	}

	scopeOf(name: string): ToolScope | undefined {
		return this.scopes.get(name);
	}

	toolsByScope(scope: ToolScope): ToolDefinition[] {
		return [...this.tools.values()].filter(
			(tool) => this.scopes.get(tool.name) === scope,
		);
	}
}
