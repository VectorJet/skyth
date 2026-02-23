import { ManifestRegistry } from "../core/registry";

export interface MCPServerConfig {
  id: string;
  command?: string;
  args: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  tool_timeout: number;
}

export class MCPRegistry extends ManifestRegistry<MCPServerConfig> {
  constructor() {
    super("mcp");
  }
}

export function buildRegistryFromConfig(mcpServers: Record<string, any>): MCPRegistry {
  const registry = new MCPRegistry();
  for (const [name, cfg] of Object.entries(mcpServers)) {
    const implementation: MCPServerConfig = {
      id: `mcp.${name}`,
      command: cfg.command,
      args: [...(cfg.args ?? [])],
      env: cfg.env,
      url: cfg.url,
      headers: cfg.headers,
      tool_timeout: Number(cfg.tool_timeout ?? cfg.toolTimeout ?? 30) || 30,
    };
    registry.register({
      manifest: {
        id: implementation.id,
        name,
        version: "0.0.0",
        entrypoint: "config",
        capabilities: ["mcp", "tools"],
        dependencies: [],
        security: { network: true, source: "config" },
      },
      root: "<runtime-config>",
      manifestPath: `<runtime-config:${name}>`,
      internal: true,
      implementation,
    });
  }
  return registry;
}
