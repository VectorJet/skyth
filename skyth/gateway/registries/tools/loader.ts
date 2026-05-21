import type { ToolRegistry } from "@/gateway/registries/tools/index.ts";
import type {
	LoadCandidate,
	LoadSource,
} from "@/gateway/core/contracts/index.ts";
import type { HookManager } from "@/gateway/hooks/index.ts";
import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";
import * as path from "path";
import { pathToFileURL } from "url";
import { createHash } from "crypto";
import chalk from "chalk";

interface ToolManifest {
	name: string;
	description: string;
	version: string;
	author: string;
}

interface ToolModule {
	[key: string]: ToolDefinition;
}

export class ToolLoader {
	private toolsDirectory: string;
	private source?: LoadSource;
	private hooks?: HookManager;

	constructor(
		toolsDirectory: string = "src/builtin/tools",
		options: { source?: LoadSource; hooks?: HookManager } = {},
	) {
		this.toolsDirectory = toolsDirectory;
		this.source = options.source;
		this.hooks = options.hooks;
	}

	getToolsDirectory(): string {
		return this.toolsDirectory;
	}

	/**
	 * Scan the tools directory for tool manifests
	 */
	async scanTools(): Promise<Map<string, string>> {
		const toolsMap = new Map<string, string>();

		try {
			const entries = await fs.readdir(this.toolsDirectory, {
				withFileTypes: true,
			});

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;

				const toolPath = path.join(this.toolsDirectory, entry.name);
				const manifestPath = path.join(toolPath, "manifest.json");

				try {
					await fs.access(manifestPath);
					toolsMap.set(entry.name, toolPath);
				} catch {
					// No manifest, skip this directory
				}
			}
		} catch (error) {
			console.error(chalk.red(`Failed to scan tools directory: ${error}`));
		}

		return toolsMap;
	}

	/**
	 * Load a tool from a directory
	 */
	private async runHooks(
		toolPath: string,
		manifest: ToolManifest,
		entryPath: string,
	): Promise<void> {
		if (!this.hooks || !this.source) return;
		const files = await this.listCandidateFiles(toolPath);
		const candidate: LoadCandidate = {
			kind: "tool",
			name: manifest.name || path.basename(toolPath),
			source: this.source,
			root: toolPath,
			manifestPath: path.join(toolPath, "manifest.json"),
			entryPath,
			files,
			metadata: { manifest, ax: (manifest as any).ax },
		};
		await this.hooks.run(candidate);
	}

	private async listCandidateFiles(toolPath: string): Promise<string[]> {
		const files: string[] = [];
		async function walk(current: string): Promise<void> {
			let entries: any[] = [];
			try {
				entries = await fs.readdir(current, { withFileTypes: true });
			} catch {
				return;
			}
			for (const entry of entries) {
				const fullPath = path.join(current, entry.name);
				const rel = path.relative(toolPath, fullPath).replace(/\\/g, "/");
				if (entry.isDirectory()) {
					if (
						entry.name === "node_modules" ||
						entry.name === ".git" ||
						entry.name === ".gateway-reload"
					)
						continue;
					await walk(fullPath);
				} else if (entry.isFile()) {
					files.push(rel);
				}
			}
		}
		await walk(toolPath);
		return files.sort();
	}

	async loadTool(
		toolPath: string,
	): Promise<{ manifest: ToolManifest; tool: ToolDefinition } | null> {
		try {
			// Read manifest
			const manifestPath = path.join(toolPath, "manifest.json");
			const manifestContent = await fs.readFile(manifestPath, "utf8");
			const manifest: ToolManifest = JSON.parse(manifestContent);

			// Check if this is a Python tool
			const pythonPath = path.join(toolPath, "index.py");
			const tsPath = path.join(toolPath, "index.ts");

			let isPython = false;
			try {
				await fs.access(pythonPath);
				isPython = true;
			} catch {
				// Not a Python tool, try TypeScript
			}
			await this.runHooks(toolPath, manifest, isPython ? pythonPath : tsPath);

			if (isPython) {
				return await this.loadPythonTool(toolPath, manifest);
			}

			// Check if package.json exists and install dependencies
			const packageJsonPath = path.join(toolPath, "package.json");
			try {
				await fs.access(packageJsonPath);
				console.log(chalk.blue(`  Installing dependencies for ${toolPath}...`));

				const { spawn } = await import("child_process");
				await new Promise<void>((resolve, reject) => {
					const proc = spawn("bun", ["install"], {
						cwd: toolPath,
						stdio: "inherit",
					});
					proc.on("close", (code) => {
						if (code === 0) {
							console.log(chalk.green(`  ✓ Dependencies installed`));
							resolve();
						} else {
							reject(new Error(`bun install failed with code ${code}`));
						}
					});
					proc.on("error", reject);
				});
			} catch {
				// No package.json, skip dependency installation
			}

			// Import the tool module with a cache-busting query so edited tools hot reload.
			// Use manifest + source mtimes, size, and current time. Bun can be aggressive
			// about module/transpiler caching for TypeScript files, so make the specifier
			// unique for every reload attempt after a fingerprint change.
			const [tsStat, manifestStat, sourceContent, manifestReloadContent] =
				await Promise.all([
					fs.stat(tsPath),
					fs.stat(manifestPath),
					fs.readFile(tsPath),
					fs.readFile(manifestPath),
				]);
			const contentHash = createHash("sha256")
				.update(sourceContent)
				.update(manifestReloadContent)
				.digest("hex");
			const cacheBust = `${tsStat.mtimeMs}-${tsStat.size}-${manifestStat.mtimeMs}-${manifestStat.size}-${contentHash}-${process.hrtime.bigint()}`;
			const importPath = await this.prepareReloadImportPath(
				toolPath,
				tsPath,
				cacheBust,
			);
			const toolModule: ToolModule = await import(
				pathToFileURL(path.resolve(importPath)).href
			);

			// Find the tool definition. Builtins mostly use named exports, while
			// generated/workspace tools commonly use `export default`.
			const toolKey = Object.keys(toolModule).find(
				(key) => key.toLowerCase().includes("tool") || key === manifest.name,
			);
			const tool = toolKey ? toolModule[toolKey] : (toolModule as any).default;

			if (!tool) {
				throw new Error(`No tool definition found in ${tsPath}`);
			}

			if (!tool || typeof tool.handler !== "function") {
				throw new Error(`Invalid tool definition in ${tsPath}`);
			}

			return { manifest, tool };
		} catch (error: any) {
			console.error(
				chalk.red(`Failed to load tool from ${toolPath}: ${error.message}`),
			);
			return null;
		}
	}

	private async prepareReloadImportPath(
		toolPath: string,
		entryPath: string,
		cacheKey: string,
	): Promise<string> {
		const reloadRoot = path.join(
			process.cwd(),
			".gateway-reload-cache",
			"tools",
			createHash("sha256").update(path.resolve(toolPath)).digest("hex"),
		);
		const targetRoot = path.join(
			reloadRoot,
			createHash("sha256").update(cacheKey).digest("hex"),
		);
		await fs.rm(targetRoot, { recursive: true, force: true });
		await fs.mkdir(targetRoot, { recursive: true });
		await this.copyReloadTree(toolPath, targetRoot);
		await this.linkNodeModules(toolPath, targetRoot);
		return path.join(targetRoot, path.relative(toolPath, entryPath));
	}

	private async linkNodeModules(
		sourceRoot: string,
		targetRoot: string,
	): Promise<void> {
		const sourceNodeModules = path.join(sourceRoot, "node_modules");
		try {
			const stat = await fs.stat(sourceNodeModules);
			if (!stat.isDirectory()) return;
			await fs.symlink(
				path.resolve(sourceNodeModules),
				path.join(targetRoot, "node_modules"),
				"dir",
			);
		} catch {
			// Most tools do not have local dependencies.
		}
	}

	private async copyReloadTree(
		sourceRoot: string,
		targetRoot: string,
	): Promise<void> {
		const walk = async (current: string) => {
			const entries = await fs
				.readdir(current, { withFileTypes: true })
				.catch(() => []);
			for (const entry of entries) {
				if (
					entry.name === ".gateway-reload" ||
					entry.name === "node_modules" ||
					entry.name === ".git"
				)
					continue;
				const sourcePath = path.join(current, entry.name);
				const relativePath = path.relative(sourceRoot, sourcePath);
				const targetPath = path.join(targetRoot, relativePath);
				if (entry.isDirectory()) {
					await fs.mkdir(targetPath, { recursive: true });
					await walk(sourcePath);
				} else if (entry.isFile()) {
					await fs.mkdir(path.dirname(targetPath), { recursive: true });
					await fs.copyFile(sourcePath, targetPath);
				}
			}
		};
		await walk(sourceRoot);
	}

	/**
	 * Load a Python-based tool
	 */
	async loadPythonTool(
		toolPath: string,
		manifest: ToolManifest,
	): Promise<{ manifest: ToolManifest; tool: ToolDefinition } | null> {
		try {
			const pythonPath = path.join(toolPath, "index.py");
			const { spawn } = await import("child_process");

			// Determine python command and requirements
			const pythonCmd = process.env.SYSTEM_PYTHON || "python3";
			let baseCmd = pythonCmd;

			// Check if uv is available
			let hasUv = false;
			try {
				const { spawnSync } = require("child_process");
				const uvCheck = spawnSync("uv", ["--version"]);
				hasUv = uvCheck.status === 0;
			} catch {
				hasUv = false;
			}

			if (hasUv) {
				baseCmd = "uv run --no-project";

				// Check for requirements.txt in the tool directory
				const requirementsPath = path.join(toolPath, "requirements.txt");
				try {
					await fs.access(requirementsPath);
					baseCmd += ` --with-requirements "${requirementsPath}"`;
				} catch {
					// No requirements.txt
				}
			}

			// Get tool metadata from Python script
			const metadataCmd = `${baseCmd} "${pythonPath}" --metadata`;
			const metadata = await new Promise<string>((resolve, reject) => {
				const proc = spawn("/bin/bash", ["-c", metadataCmd], {
					env: { ...process.env, SYSTEM_PYTHON: pythonCmd },
				});

				let stdout = "";
				let stderr = "";

				proc.stdout?.on("data", (data) => {
					stdout += data.toString();
				});
				proc.stderr?.on("data", (data) => {
					stderr += data.toString();
				});

				proc.on("close", (code) => {
					if (code === 0) resolve(stdout);
					else reject(new Error(`Failed to get metadata: ${stderr}`));
				});

				proc.on("error", reject);
			});

			const toolMetadata = JSON.parse(metadata);

			// Create a wrapper tool definition
			const tool: ToolDefinition = {
				name: toolMetadata.name || manifest.name,
				description: toolMetadata.description || manifest.description,
				parameters: toolMetadata.parameters || [],
				handler: async (args: Record<string, any>) => {
					// Execute Python script with arguments
					const argsJson = JSON.stringify(args);
					const cmd = `${baseCmd} "${pythonPath}" '${argsJson.replace(/'/g, "'\\''")}'`;

					return new Promise((resolve, reject) => {
						const proc = spawn("/bin/bash", ["-c", cmd], {
							env: process.env,
						});

						let stdout = "";
						let stderr = "";

						proc.stdout?.on("data", (data) => {
							stdout += data.toString();
						});
						proc.stderr?.on("data", (data) => {
							stderr += data.toString();
						});

						proc.on("close", (code) => {
							if (code === 0) {
								try {
									const result = JSON.parse(stdout);
									resolve(result);
								} catch {
									resolve(stdout);
								}
							} else {
								reject(new Error(`Python tool failed: ${stderr}`));
							}
						});

						proc.on("error", reject);
					});
				},
				metadata: {
					category: toolMetadata.category || "python",
					tags: toolMetadata.tags || ["python"],
					version: manifest.version,
					author: manifest.author,
				},
			};

			console.log(
				chalk.green(
					`  ✓ Loaded Python tool: ${tool.name}${hasUv ? " (via uv)" : ""}`,
				),
			);
			return { manifest, tool };
		} catch (error: any) {
			console.error(
				chalk.red(
					`Failed to load Python tool from ${toolPath}: ${error.message}`,
				),
			);
			return null;
		}
	}

	/**
	 * Load all tools and register them
	 */
	async loadAllTools(
		registry: ToolRegistry,
		source: "custom" | "builtin" = "builtin",
	): Promise<void> {
		console.log(chalk.blue("\nLoading custom tools..."));

		const toolsMap = await this.scanTools();
		console.log(chalk.blue(`Found ${toolsMap.size} tool(s)`));

		for (const [toolName, toolPath] of toolsMap.entries()) {
			console.log(chalk.blue(`Loading tool: ${toolName}`));

			const loaded = await this.loadTool(toolPath);
			if (loaded) {
				const { manifest, tool } = loaded;

				try {
					if (registry.hasTool(tool.name)) {
						console.log(
							chalk.yellow(
								`  ↷ Skipping already registered tool: ${tool.name}`,
							),
						);
						continue;
					}
					registry.register(tool, source);
				} catch (error: any) {
					console.error(
						chalk.red(`Failed to register tool ${toolName}: ${error.message}`),
					);
				}
			}
		}

		console.log(
			chalk.green(`\n✓ Loaded ${registry.listToolNames().length} tool(s)\n`),
		);
	}
}
