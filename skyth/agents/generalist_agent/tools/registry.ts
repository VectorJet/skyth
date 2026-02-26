import { Tool } from "@/agents/generalist_agent/tools/base";

export type ToolScope = "agent" | "global" | "workspace";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly scopes = new Map<string, ToolScope>();

  register(tool: Tool, scope: ToolScope = "agent"): void {
    this.tools.set(tool.name, tool);
    this.scopes.set(tool.name, scope);
  }

  unregister(name: string): void {
    this.tools.delete(name);
    this.scopes.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getDefinitions(): Array<Record<string, any>> {
    return [...this.tools.values()].map((tool) => tool.toSchema());
  }

  async execute(name: string, params: Record<string, any>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) return `Error: Tool '${name}' not found`;
    try {
      const errors = tool.validateParams(params);
      if (errors.length) return `Error: Invalid parameters for tool '${name}': ${errors.join("; ")}`;
      return await tool.execute(params);
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

  toolsByScope(scope: ToolScope): Tool[] {
    return [...this.tools.values()].filter((tool) => this.scopes.get(tool.name) === scope);
  }
}
