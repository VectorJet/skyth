import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { Config } from "@/config/config";
import { Glob } from "@/utils/glob";
import type { ToolDefinition } from "@/base/base_agent/sdk/types";
import { ToolRegistry as GatewayToolRegistry } from "@/gateway/registries/tools";
import {
	convertLegacyToolInfo,
	isLegacyToolInfoLike,
	isToolDefinitionLike,
} from "@/base/base_agent/tools/converter";
import {
	gatewayParametersToJsonSchema,
	toGatewayToolDefinition,
} from "@/base/base_agent/tools/gateway_adapter";
import {
	listWorkspaceToolScripts,
	sanitizeToolName,
	TOOL_SCRIPT_EXTENSIONS,
	WorkspaceCommandTool,
} from "@/base/base_agent/tools/workspace_command";

export type ToolScope = "agent" | "global" | "workspace";

export class ToolRegistry {
	private readonly gateway: GatewayToolRegistry;
	private readonly tools = new Map<string, ToolDefinition>();
	private readonly scopes = new Map<string, ToolScope>();

	constructor(gateway?: GatewayToolRegistry) {
		this.gateway =
			gateway ??
			new GatewayToolRegistry({
				allowOverride: true,
				validateSchemas: false,
			});
	}

	async autoDiscover(
		workspaceRoot: string,
		options: { extraDirectories?: string[]; loadGlobalTools?: boolean } = {},
	): Promise<void> {
		const { AgentRegistry } = await import("@/agents/registry");
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
		this.gateway.register(toGatewayToolDefinition(tool), "custom");
	}

	unregister(name: string): void {
		this.tools.delete(name);
		this.scopes.delete(name);
		this.gateway.unregister(name);
	}

	get(name: string): ToolDefinition | undefined {
		return this.tools.get(name);
	}

	has(name: string): boolean {
		return this.gateway.hasTool(name);
	}

	getDefinitions(): Array<Record<string, any>> {
		return [...this.gateway.getAllTools().values()].map(
			({ definition: tool }) => {
				return {
					type: "function",
					function: {
						name: tool.name,
						description: tool.description,
						parameters: gatewayParametersToJsonSchema(tool.parameters),
					},
				};
			},
		);
	}

	async execute(
		name: string,
		params: Record<string, any>,
		context?: Record<string, any>,
	): Promise<string> {
		const result = await this.gateway.executeTool(name, {
			...params,
			_context: context,
		});
		if (!result.success) return `Error executing ${name}: ${result.error}`;
		if (typeof result.result === "string") return result.result;
		if (result.result === undefined) return "";
		return JSON.stringify(result.result);
	}

	get toolNames(): string[] {
		return this.gateway.listToolNames();
	}

	scopeOf(name: string): ToolScope | undefined {
		return this.scopes.get(name);
	}

	toolsByScope(scope: ToolScope): ToolDefinition[] {
		return [...this.tools.values()].filter(
			(tool) => this.scopes.get(tool.name) === scope,
		);
	}

	getGatewayRegistry(): GatewayToolRegistry {
		return this.gateway;
	}
}
