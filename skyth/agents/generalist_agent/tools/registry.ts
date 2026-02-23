import { Tool } from "./base";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
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
}
