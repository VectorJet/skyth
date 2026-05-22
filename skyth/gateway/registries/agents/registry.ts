import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	ManifestValidationError,
	manifestFromPath,
} from "@/base/base_agent/manifest/manifest";
import type {
	AgentRegistryOptions,
	RegisteredAgent,
} from "@/gateway/registries/agents/types";

export class GatewayAgentRegistry {
	private readonly agents = new Map<string, RegisteredAgent>();
	private readonly messages: string[] = [];
	private readonly options: Required<AgentRegistryOptions>;

	constructor(options: AgentRegistryOptions = {}) {
		this.options = {
			allowOverride: options.allowOverride ?? false,
			failOnBuiltinError: options.failOnBuiltinError ?? true,
		};
	}

	get diagnostics(): string[] {
		return [...this.messages];
	}

	get ids(): string[] {
		return [...this.agents.keys()].sort();
	}

	getAgent(id: string): RegisteredAgent | undefined {
		return this.agents.get(id);
	}

	getAllAgents(): Map<string, RegisteredAgent> {
		return new Map(this.agents);
	}

	discover(options: {
		workspaceRoot: string;
		externalPaths?: string[];
		userRoot?: string;
	}): void {
		const builtinRoot = join(options.workspaceRoot, "skyth", "agents");
		const userRoot = options.userRoot ?? join(homedir(), ".skyth", "agents");

		this.discoverRoot(builtinRoot, "builtin");
		this.discoverRoot(userRoot, "user");
		for (const externalPath of options.externalPaths ?? []) {
			this.discoverRoot(externalPath, "external");
		}
	}

	register(agent: RegisteredAgent): boolean {
		const existing = this.agents.get(agent.manifest.id);
		if (existing && !this.options.allowOverride) {
			const message = `[agents] duplicate id '${agent.manifest.id}': ${agent.manifestPath} conflicts with ${existing.manifestPath}`;
			this.messages.push(message);
			if (agent.source === "builtin" && this.options.failOnBuiltinError) {
				throw new Error(message);
			}
			return false;
		}
		this.agents.set(agent.manifest.id, agent);
		return true;
	}

	private discoverRoot(
		root: string,
		source: RegisteredAgent["source"],
		parentAgentId?: string,
	): void {
		if (!existsSync(root) || !statSync(root).isDirectory()) return;

		for (const dir of childDirectories(root)) {
			const manifestPath = join(dir, "agent_manifest.json");
			if (!existsSync(manifestPath)) continue;
			let registered: RegisteredAgent | undefined;
			try {
				const manifest = manifestFromPath(manifestPath);
				registered = {
					manifest,
					root: resolve(dir),
					manifestPath: resolve(manifestPath),
					source,
					parentAgentId,
				};
				this.register(registered);
			} catch (error) {
				this.recordDiscoveryError(error, source);
			}

			const subagentRoot = join(dir, "subagents");
			this.discoverRoot(
				subagentRoot,
				source,
				registered?.manifest.id ?? parentAgentId,
			);
		}
	}

	private recordDiscoveryError(
		error: unknown,
		source: RegisteredAgent["source"],
	): void {
		if (
			!(error instanceof ManifestValidationError) &&
			!(error instanceof Error)
		) {
			return;
		}
		const message = error instanceof Error ? error.message : String(error);
		this.messages.push(message);
		if (source === "builtin" && this.options.failOnBuiltinError) throw error;
	}
}

function childDirectories(root: string): string[] {
	return readdirSync(root)
		.map((name) => join(root, name))
		.filter((path) => existsSync(path) && statSync(path).isDirectory())
		.sort();
}
