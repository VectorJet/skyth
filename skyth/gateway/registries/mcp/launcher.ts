import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
	MCPManifest,
	MCPServerInstance,
} from "@/gateway/registries/mcp/types.ts";
import { existsSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";

export class MCPServerLauncher {
	private servers = new Map<string, MCPServerInstance>();

	/**
	 * Install dependencies for an MCP module if package.json exists
	 */
	private async installDependencies(serverPath: string): Promise<void> {
		const packageJsonPath = join(serverPath, "package.json");

		if (!existsSync(packageJsonPath)) {
			return;
		}

		console.log(`  Installing dependencies for ${serverPath}...`);

		return new Promise((resolve, reject) => {
			const install = spawn("bun", ["install"], {
				cwd: serverPath,
				stdio: "inherit",
			});

			install.on("close", (code) => {
				if (code === 0) {
					console.log(`  ✓ Dependencies installed`);
					resolve();
				} else {
					reject(
						new Error(`Failed to install dependencies, exit code: ${code}`),
					);
				}
			});

			install.on("error", reject);
		});
	}

	/**
	 * Launch an MCP server based on its manifest
	 */
	async launchServer(
		name: string,
		manifest: MCPManifest,
		serverPath: string,
	): Promise<MCPServerInstance> {
		console.log(`Starting MCP server: ${name}`);

		try {
			// Install dependencies if package.json exists
			await this.installDependencies(serverPath);

			const transport = this.createTransport(name, manifest, serverPath);

			const client = new Client(
				{
					name: `mcp-registry-client-${name}`,
					version: "1.0.0",
				},
				{
					capabilities: {},
				},
			);

			// Connect to the server (this will spawn the process) with timeout.
			// npx-based servers may need longer for first-run package download.
			const connectTimeoutMs = manifest.startupTimeoutMs ?? 30000;
			const connectTimeout = new Promise((_, reject) =>
				setTimeout(
					() =>
						reject(new Error(`Connection timeout after ${connectTimeoutMs}ms`)),
					connectTimeoutMs,
				),
			);

			await Promise.race([client.connect(transport), connectTimeout]);

			// List available tools with timeout
			const listToolsTimeoutMs = manifest.startupTimeoutMs ?? 15000;
			const listToolsTimeout = new Promise((_, reject) =>
				setTimeout(
					() =>
						reject(
							new Error(`List tools timeout after ${listToolsTimeoutMs}ms`),
						),
					listToolsTimeoutMs,
				),
			);

			const toolsResponse = (await Promise.race([
				client.listTools(),
				listToolsTimeout,
			])) as any;
			const tools = new Map();

			for (const tool of toolsResponse.tools) {
				tools.set(tool.name, tool);
				console.log(`  ✓ Registered tool: ${tool.name}`);
			}

			const instance: MCPServerInstance = {
				name,
				manifest,
				process: null, // Process is managed by the transport
				client,
				tools,
				status: "running",
			};

			this.servers.set(name, instance);

			console.log(`✓ MCP server ${name} started with ${tools.size} tools`);
			return instance;
		} catch (error) {
			console.error(`Failed to launch MCP server ${name}:`, error);
			throw error;
		}
	}

	/**
	 * Stop an MCP server
	 */
	async stopServer(name: string): Promise<void> {
		const instance = this.servers.get(name);
		if (!instance) {
			return;
		}

		console.log(`Stopping MCP server: ${name}`);

		try {
			await instance.client.close();
			instance.status = "stopped";
			this.servers.delete(name);
			console.log(`✓ MCP server ${name} stopped`);
		} catch (error) {
			console.error(`Error stopping MCP server ${name}:`, error);
		}
	}

	/**
	 * Get a running server instance
	 */
	getServer(name: string): MCPServerInstance | undefined {
		return this.servers.get(name);
	}

	/**
	 * Get all running servers
	 */
	getAllServers(): Map<string, MCPServerInstance> {
		return this.servers;
	}

	/**
	 * Call a tool on a specific MCP server
	 */
	async callTool(
		serverName: string,
		toolName: string,
		args: any,
	): Promise<any> {
		const instance = this.servers.get(serverName);
		if (!instance) {
			throw new Error(`MCP server ${serverName} not found`);
		}

		if (instance.status !== "running") {
			throw new Error(`MCP server ${serverName} is not running`);
		}

		if (!instance.tools.has(toolName)) {
			throw new Error(`Tool ${toolName} not found in server ${serverName}`);
		}

		return await instance.client.callTool({ name: toolName, arguments: args });
	}

	/**
	 * Determine the command to run the MCP server
	 */
	private createTransport(
		name: string,
		manifest: MCPManifest,
		serverPath: string,
	) {
		const transport = manifest.transport || "stdio";
		if (transport === "http") {
			if (!manifest.url) {
				throw new Error(
					`MCP server ${name} uses http transport but has no url`,
				);
			}
			return new StreamableHTTPClientTransport(new URL(manifest.url), {
				requestInit: {
					headers: manifest.headers || {},
				},
			});
		}

		if (transport === "sse") {
			if (!manifest.url) {
				throw new Error(`MCP server ${name} uses sse transport but has no url`);
			}
			return new SSEClientTransport(new URL(manifest.url), {
				eventSourceInit: {
					fetch: (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
						fetch(input, {
							...init,
							headers: {
								...(init?.headers
									? Object.fromEntries(new Headers(init.headers).entries())
									: {}),
								...(manifest.headers || {}),
							},
						}),
				},
				requestInit: {
					headers: manifest.headers || {},
				},
			});
		}

		const command = this.getServerCommand(name, manifest);
		return new StdioClientTransport({
			command: command.cmd,
			args: command.args,
			env: {
				...(process.env as Record<string, string>),
				...(manifest.env || {}),
			},
			cwd: serverPath,
		});
	}

	private getServerCommand(
		name: string,
		manifest: MCPManifest,
	): { cmd: string; args: string[] } {
		// If manifest specifies a command, use it. Only append allowedPaths when
		// the manifest opts in via `appendAllowedPaths` — most MCP servers
		// (chrome-devtools, context7, ...) reject unexpected positional args.
		if (manifest.command) {
			const args = [...(manifest.args || [])];
			if (
				manifest.appendAllowedPaths &&
				manifest.allowedPaths &&
				manifest.allowedPaths.length > 0
			) {
				args.push(...manifest.allowedPaths);
			}
			return { cmd: manifest.command, args };
		}

		// Convention: try to run mcp-server-{name} via bunx
		// This works for official MCP servers like @modelcontextprotocol/server-{name}
		const conventionArgs = [`mcp-server-${name}`];

		if (
			manifest.appendAllowedPaths &&
			manifest.allowedPaths &&
			manifest.allowedPaths.length > 0
		) {
			conventionArgs.push(...manifest.allowedPaths);
		}

		return {
			cmd: "bunx",
			args: conventionArgs,
		};
	}
}
