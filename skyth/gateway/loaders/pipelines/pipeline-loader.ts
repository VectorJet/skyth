import type { PipelineRegistry } from "@/gateway/registries/pipelines/index.ts";
import type { PipelineDefinition } from "@/gateway/registries/pipelines/index.ts";
import type {
	LoadCandidate,
	LoadSource,
} from "@/gateway/core/contracts/index.ts";
import type { HookManager } from "@/gateway/hooks/index.ts";
import * as fs from "fs/promises";
import * as path from "path";
import { pathToFileURL } from "url";
import { createHash } from "crypto";
import { spawn } from "child_process";
import { listPipelineCandidateFiles } from "@/gateway/loaders/pipelines/files.ts";

export class PipelineLoader {
	private pipelinesDir: string;
	private source?: LoadSource;
	private hooks?: HookManager;

	constructor(
		pipelinesDir: string,
		options: { source?: LoadSource; hooks?: HookManager } = {},
	) {
		this.pipelinesDir = pipelinesDir;
		this.source = options.source;
		this.hooks = options.hooks;
	}

	/**
	 * Load all pipelines from the pipelines directory
	 */
	async loadAllPipelines(registry: PipelineRegistry): Promise<void> {
		console.log(`[PipelineLoader] Loading pipelines from ${this.pipelinesDir}`);

		try {
			const entries = await fs.readdir(this.pipelinesDir, {
				withFileTypes: true,
			});

			for (const entry of entries) {
				if (entry.isDirectory() && entry.name !== "global") {
					await this.loadPipeline(entry.name, registry);
				}
			}

			console.log(`[PipelineLoader] Finished loading pipelines`);
		} catch (error: any) {
			console.error(
				`[PipelineLoader] Error loading pipelines: ${error.message}`,
			);
		}
	}

	/**
	 * Load a specific pipeline
	 */
	async loadPipeline(
		pipelineName: string,
		registry: PipelineRegistry,
	): Promise<void> {
		const pipelineDir = path.join(this.pipelinesDir, pipelineName);
		const manifestPath = path.join(pipelineDir, "manifest.json");
		const tsIndexPath = path.join(pipelineDir, "index.ts");
		const pyIndexPath = path.join(pipelineDir, "index.py");

		try {
			// Check if manifest exists
			await fs.access(manifestPath);

			// Check if it's a Python pipeline
			let isPython = false;
			try {
				await fs.access(pyIndexPath);
				isPython = true;
			} catch {
				// Not a Python pipeline
			}
			await this.runHooks(
				pipelineName,
				pipelineDir,
				manifestPath,
				isPython ? pyIndexPath : tsIndexPath,
			);

			if (isPython) {
				await this.loadPythonPipeline(
					pipelineName,
					pipelineDir,
					manifestPath,
					pyIndexPath,
					registry,
				);
			} else {
				await this.loadTypeScriptPipeline(pipelineName, tsIndexPath, registry);
			}
		} catch (error: any) {
			console.error(
				`[PipelineLoader] Failed to load pipeline ${pipelineName}: ${error.message}`,
			);
		}
	}

	/**
	 * Load a TypeScript pipeline
	 */
	private async loadTypeScriptPipeline(
		pipelineName: string,
		indexPath: string,
		registry: PipelineRegistry,
	): Promise<void> {
		await fs.access(indexPath);

		const [sourceStat, sourceContent] = await Promise.all([
			fs.stat(indexPath),
			fs.readFile(indexPath),
		]);
		const contentHash = createHash("sha256")
			.update(sourceContent)
			.digest("hex");
		const cacheKey = `${sourceStat.mtimeMs}-${sourceStat.size}-${contentHash}-${process.hrtime.bigint()}`;
		const importPath = await this.prepareReloadImportPath(
			path.dirname(indexPath),
			indexPath,
			cacheKey,
		);

		// Load the pipeline module
		const indexUrl = pathToFileURL(path.resolve(importPath)).href;
		const pipelineModule = await import(indexUrl);
		const pipelineDefinition: PipelineDefinition =
			pipelineModule.default || pipelineModule.pipeline;

		if (!pipelineDefinition) {
			console.error(
				`[PipelineLoader] Pipeline ${pipelineName} does not export a default or 'pipeline' definition`,
			);
			return;
		}

		// Register the pipeline idempotently. Runtime loading and hot reload can
		// revisit the same source; duplicate registrations should not be startup errors.
		if (registry.hasPipeline(pipelineDefinition.name)) {
			console.log(
				`[PipelineLoader] Skipping already registered pipeline: ${pipelineDefinition.name}`,
			);
			return;
		}
		if (registry.hasPipeline(pipelineDefinition.name)) {
			console.log(
				`[PipelineLoader] Skipping already registered pipeline: ${pipelineDefinition.name}`,
			);
			return;
		}
		registry.register(pipelineDefinition, pipelineName);
	}

	private async prepareReloadImportPath(
		pipelineDir: string,
		entryPath: string,
		cacheKey: string,
	): Promise<string> {
		const reloadRoot = path.join(
			process.cwd(),
			".gateway-reload-cache",
			"pipelines",
			createHash("sha256").update(path.resolve(pipelineDir)).digest("hex"),
		);
		const targetRoot = path.join(
			reloadRoot,
			createHash("sha256").update(cacheKey).digest("hex"),
		);
		await fs.rm(targetRoot, { recursive: true, force: true });
		await fs.mkdir(targetRoot, { recursive: true });
		await this.copyReloadTree(pipelineDir, targetRoot);
		await this.linkNodeModules(pipelineDir, targetRoot);
		return path.join(targetRoot, path.relative(pipelineDir, entryPath));
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
			// Most pipelines do not have local dependencies.
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

	private async runHooks(
		pipelineName: string,
		pipelineDir: string,
		manifestPath: string,
		entryPath: string,
	): Promise<void> {
		if (!this.hooks || !this.source) return;
		const rawManifest = await fs
			.readFile(manifestPath, "utf8")
			.catch(() => "{}");
		const manifest = JSON.parse(rawManifest);
		const files = await listPipelineCandidateFiles(pipelineDir);
		const candidate: LoadCandidate = {
			kind: "pipeline",
			name: pipelineName,
			source: this.source,
			root: pipelineDir,
			manifestPath,
			entryPath,
			files,
			metadata: { manifest, ax: manifest.ax },
		};
		await this.hooks.run(candidate);
	}

	/**
	 * Load a Python pipeline
	 */
	private async loadPythonPipeline(
		pipelineName: string,
		pipelineDir: string,
		manifestPath: string,
		pyIndexPath: string,
		registry: PipelineRegistry,
	): Promise<void> {
		// Read manifest
		const manifestContent = await fs.readFile(manifestPath, "utf8");
		const manifest = JSON.parse(manifestContent);

		// Determine python command and requirements
		const pythonCmd = process.env.SYSTEM_PYTHON || "python3";
		let baseCmd = pythonCmd;

		// Check if uv is available
		let hasUv = false;
		try {
			// Use spawnSync for a quick check
			const { spawnSync } = require("child_process");
			const uvCheck = spawnSync("uv", ["--version"]);
			hasUv = uvCheck.status === 0;
		} catch {
			hasUv = false;
		}

		if (hasUv) {
			baseCmd = "uv run --no-project";

			// Check for requirements.txt in the pipeline directory
			const requirementsPath = path.join(pipelineDir, "requirements.txt");
			try {
				await fs.access(requirementsPath);
				baseCmd += ` --with-requirements "${requirementsPath}"`;
			} catch {
				// No requirements.txt
			}
		}

		// Get pipeline metadata from Python script
		const metadataCmd = `${baseCmd} "${pyIndexPath}" --metadata`;

		const metadata = await new Promise<string>((resolve, reject) => {
			const proc = spawn("/bin/bash", ["-c", metadataCmd], {
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
				if (code === 0) resolve(stdout);
				else reject(new Error(`Failed to get metadata: ${stderr}`));
			});

			proc.on("error", reject);
		});

		const pipelineMetadata = JSON.parse(metadata);

		// Create a wrapper pipeline definition
		const pipelineDefinition: PipelineDefinition = {
			name: pipelineMetadata.name || manifest.name,
			description: pipelineMetadata.description || manifest.description,
			parameters: pipelineMetadata.parameters || [],
			handler: async (args: Record<string, any>) => {
				// Execute Python script with arguments
				const argsJson = JSON.stringify(args);
				const cmd = `${baseCmd} "${pyIndexPath}" '${argsJson.replace(/'/g, "'\\''")}'`;

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
							reject(new Error(`Python pipeline failed: ${stderr}`));
						}
					});

					proc.on("error", reject);
				});
			},
			metadata: {
				category: pipelineMetadata.category || manifest.category || "python",
				tags: pipelineMetadata.tags || ["python"],
				version: manifest.version,
				author: manifest.author,
				ax: pipelineMetadata.ax || manifest.ax,
				summary: pipelineMetadata.summary || manifest.summary,
				visibility: pipelineMetadata.visibility || manifest.visibility,
				triggerPhrases:
					pipelineMetadata.triggerPhrases || manifest.triggerPhrases,
				relatedTools: pipelineMetadata.relatedTools || manifest.relatedTools,
				whenNotToUse: pipelineMetadata.whenNotToUse || manifest.whenNotToUse,
				commonUses: pipelineMetadata.commonUses || manifest.commonUses,
				followUps: pipelineMetadata.followUps || manifest.followUps,
				intentExamples:
					pipelineMetadata.intentExamples || manifest.intentExamples,
			},
		};

		console.log(
			`[PipelineLoader] Loaded Python pipeline: ${pipelineDefinition.name}${hasUv ? " (via uv)" : ""}`,
		);
		registry.register(pipelineDefinition, pipelineName);
	}
}
