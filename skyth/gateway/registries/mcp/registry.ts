import { watch } from "fs";
import { ManifestScanner } from "@/gateway/registries/mcp/scanner.ts";
import { MCPServerLauncher } from "@/gateway/registries/mcp/launcher.ts";
import type { MCPRegistryOptions } from "@/gateway/registries/mcp/types.ts";

export class MCPRegistry {
	private scanner: ManifestScanner;
	private launcher: MCPServerLauncher;
	private watchers: ReturnType<typeof watch>[] = [];
	private options: MCPRegistryOptions;

	constructor(options: MCPRegistryOptions = {}) {
		this.options = {
			mcpDirectory: options.mcpDirectory || "src/builtin/mcp",
			mcpDirectories:
				options.mcpDirectories ||
				(options.mcpDirectory ? [options.mcpDirectory] : ["src/builtin/mcp"]),
			autoReload: options.autoReload ?? true,
		};

		this.scanner = new ManifestScanner(this.options.mcpDirectories);
		this.launcher = new MCPServerLauncher();
	}

	/**
	 * Initialize the registry: scan and launch all MCP servers
	 */
	async initialize(): Promise<void> {
		console.log("Initializing MCP Registry...");

		// Scan for manifests
		const manifests = await this.scanner.scanManifests();
		const skipped = this.scanner.getSkippedManifests();
		for (const [name, reason] of skipped) {
			console.log(`↷ MCP server ${name} skipped (${reason})`);
		}

		if (manifests.size === 0) {
			console.log("No MCP servers found");
			return;
		}

		// Launch all servers
		for (const [name, manifest] of manifests) {
			try {
				const serverPath = this.scanner.getServerPath(name);
				await this.launcher.launchServer(name, manifest, serverPath);
			} catch (error) {
				console.error(`Failed to launch ${name}:`, error);
			}
		}

		// Start watching for changes if auto-reload is enabled
		if (this.options.autoReload) {
			this.startWatching();
		}

		console.log(
			`✓ MCP Registry initialized with ${this.launcher.getAllServers().size} servers`,
		);
	}

	/**
	 * Start watching for manifest changes
	 */
	private startWatching(): void {
		console.log("Starting file watcher for hot reload...");

		for (const mcpDirectory of this.options.mcpDirectories || [
			this.options.mcpDirectory!,
		]) {
			const watcher = watch(
				mcpDirectory,
				{ recursive: true },
				async (_eventType, filename) => {
					if (!filename || !filename.includes("manifest.json")) {
						return;
					}

					console.log(`Detected change in ${filename}, reloading...`);

					// Extract server name from path
					const serverName = filename.split("/")[0];

					// Reload the specific server
					await this.reloadServer(serverName!);
				},
			);
			this.watchers.push(watcher);
		}

		console.log("✓ File watcher started");
	}

	/**
	 * Reload a specific MCP server
	 */
	async reloadServer(serverName: string): Promise<void> {
		console.log(`Reloading MCP server: ${serverName}`);

		try {
			// Stop the existing server
			await this.launcher.stopServer(serverName);

			// Wait a bit for cleanup
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Re-scan manifests
			const manifests = await this.scanner.scanManifests();
			const manifest = manifests.get(serverName);

			if (!manifest) {
				console.warn(`Manifest for ${serverName} not found, server removed`);
				return;
			}

			// Relaunch the server
			const serverPath = this.scanner.getServerPath(serverName);
			await this.launcher.launchServer(serverName, manifest, serverPath);

			console.log(`✓ MCP server ${serverName} reloaded`);
		} catch (error) {
			console.error(`Failed to reload ${serverName}:`, error);
		}
	}

	/**
	 * Get all available tools from all servers
	 */
	getAllTools(): Map<string, { server: string; tool: any }> {
		const allTools = new Map();

		for (const [serverName, instance] of this.launcher.getAllServers()) {
			if (instance.manifest.exposeTools === false) continue;
			for (const [toolName, tool] of instance.tools) {
				// Prefix tool name with server name to avoid conflicts
				// Use underscore instead of dot to comply with MCP name pattern: ^[a-zA-Z0-9_-]{1,64}$
				const fullToolName = `${serverName}_${toolName}`;
				allTools.set(fullToolName, { server: serverName, tool });
			}
		}

		return allTools;
	}

	/**
	 * Call a tool by its full name (server_tool)
	 */
	async callTool(fullToolName: string, args: any): Promise<any> {
		// Split on first underscore to separate server name from tool name
		const firstUnderscoreIndex = fullToolName.indexOf("_");

		if (firstUnderscoreIndex === -1) {
			throw new Error(
				`Invalid tool name format. Expected: server_tool, got: ${fullToolName}`,
			);
		}

		const serverName = fullToolName.substring(0, firstUnderscoreIndex);
		const toolName = fullToolName.substring(firstUnderscoreIndex + 1);

		if (!serverName || !toolName) {
			throw new Error(
				`Invalid tool name format. Expected: server_tool, got: ${fullToolName}`,
			);
		}

		return await this.launcher.callTool(serverName, toolName, args);
	}

	/**
	 * Get a specific server instance
	 */
	getServer(name: string) {
		return this.launcher.getServer(name);
	}

	/**
	 * Get all server instances
	 */
	getAllServers() {
		return this.launcher.getAllServers();
	}

	getSkippedServers() {
		return this.scanner.getSkippedManifests();
	}

	/**
	 * Shutdown the registry and all servers
	 */
	async shutdown(): Promise<void> {
		console.log("Shutting down MCP Registry...");

		// Stop watching
		for (const watcher of this.watchers) watcher.close();
		this.watchers = [];

		// Stop all servers
		const servers = Array.from(this.launcher.getAllServers().keys());
		for (const serverName of servers) {
			await this.launcher.stopServer(serverName);
		}

		console.log("✓ MCP Registry shutdown complete");
	}
}
