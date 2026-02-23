import { join } from "node:path";
import { ManifestRegistry } from "../core/registry";

export class AgentRegistry extends ManifestRegistry<unknown> {
  constructor() {
    super("agents");
  }

  discoverAgents(workspaceRoot: string, externalPaths: string[] = []): void {
    this.discover([join(workspaceRoot, "skyth", "agents")], externalPaths, "agent_manifest.json");
  }
}
