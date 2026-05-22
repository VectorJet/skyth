import { existsSync } from "fs";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import type { MCPManifest } from "@/gateway/registries/mcp/types.ts";
import { builtinCapabilityRoot } from "@/gateway/sources/index.ts";

export class ManifestScanner {
	private mcpDirectories: string[];
	private skipped = new Map<string, string>();

	constructor(mcpDirectory: string | string[] = builtinCapabilityRoot("mcp")) {
		this.mcpDirectories = Array.isArray(mcpDirectory)
			? mcpDirectory
			: [mcpDirectory];
	}

	/**
	 * Scan the MCP directory for all manifest.json files
	 */
	async scanManifests(): Promise<Map<string, MCPManifest>> {
		const manifests = new Map<string, MCPManifest>();
		this.skipped.clear();

		try {
			for (const mcpDirectory of this.mcpDirectories) {
				const entries = await readdir(mcpDirectory, { withFileTypes: true });

				for (const entry of entries) {
					if (entry.isDirectory()) {
						const manifestPath = join(
							mcpDirectory,
							entry.name,
							"manifest.json",
						);

						try {
							const manifestFile = Bun.file(manifestPath);
							const exists = await manifestFile.exists();

							if (exists) {
								const manifest = (await manifestFile.json()) as MCPManifest;
								const serverPath = join(mcpDirectory, entry.name);
								const dotEnv = await this.loadDotEnv(serverPath);
								const manifestEnv =
									(manifest as any).env &&
									typeof (manifest as any).env === "object"
										? Object.fromEntries(
												Object.entries((manifest as any).env).map(
													([key, value]) => [key, String(value)],
												),
											)
										: {};
								const effectiveEnv: Record<string, string | undefined> = {
									...process.env,
									...dotEnv,
									...manifestEnv,
								};

								// Substitute ${ENV_VAR} tokens in manifest fields so builtin
								// entries can reference dynamic locations and secret headers.
								const subst = (s: string) =>
									s.replace(
										/\$\{([A-Z0-9_]+)\}/g,
										(_, k) => effectiveEnv[k] ?? `\${${k}}`,
									);
								if (Array.isArray(manifest.allowedPaths)) {
									manifest.allowedPaths = manifest.allowedPaths.map(subst);
								}
								if (Array.isArray((manifest as any).args)) {
									(manifest as any).args = (manifest as any).args.map(subst);
								}

								if (Array.isArray((manifest as any).requiredEnv)) {
									manifest.requiredEnv = (manifest as any).requiredEnv.map(
										String,
									);
								}

								if (typeof (manifest as any).url === "string") {
									(manifest as any).url = subst((manifest as any).url);
								}

								if (
									(manifest as any).headers &&
									typeof (manifest as any).headers === "object"
								) {
									manifest.headers = Object.fromEntries(
										Object.entries((manifest as any).headers).map(
											([key, value]) => [key, subst(String(value))],
										),
									);
								}

								const mergedEnv = { ...dotEnv, ...manifestEnv };
								if (Object.keys(mergedEnv).length > 0) {
									manifest.env = Object.fromEntries(
										Object.entries(mergedEnv).map(([key, value]) => [
											key,
											subst(value),
										]),
									);
								}

								const missingEnv = (manifest.requiredEnv || [])
									.map((name) => name.trim())
									.filter((name) => !effectiveEnv[name]);
								if (missingEnv.length > 0) {
									const reason = `missing required env: ${missingEnv.join(", ")}`;
									this.skipped.set(entry.name, reason);
									console.warn(
										`↷ Skipping MCP manifest ${manifest.name}: ${reason}`,
									);
									continue;
								}

								// Validate manifest
								if (this.validateManifest(manifest)) {
									manifests.set(entry.name, manifest);
									console.log(`✓ Loaded MCP manifest: ${manifest.name}`);
								} else {
									console.warn(`✗ Invalid manifest in ${entry.name}`);
								}
							}
						} catch (error) {
							console.error(`Error reading manifest in ${entry.name}:`, error);
						}
					}
				}
			}
		} catch (error) {
			console.error("Error scanning MCP directory:", error);
		}

		return manifests;
	}

	/**
	 * Validate manifest structure
	 */
	private validateManifest(manifest: any): manifest is MCPManifest {
		const transport = manifest.transport || "stdio";
		const validTransport =
			transport === "stdio" || transport === "http" || transport === "sse";
		const transportConfigValid =
			transport === "stdio" ||
			(typeof manifest.url === "string" && manifest.url.trim().length > 0);

		return (
			typeof manifest === "object" &&
			typeof manifest.name === "string" &&
			typeof manifest.description === "string" &&
			Array.isArray(manifest.allowedPaths) &&
			validTransport &&
			transportConfigValid
		);
	}

	getSkippedManifests(): Map<string, string> {
		return new Map(this.skipped);
	}

	private async loadDotEnv(
		serverPath: string,
	): Promise<Record<string, string>> {
		const env: Record<string, string> = {};
		try {
			const content = await readFile(join(serverPath, ".env"), "utf8");
			for (const line of content.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith("#")) continue;
				const [key, ...valueParts] = trimmed.split("=");
				if (!key || valueParts.length === 0) continue;
				let value = valueParts.join("=").trim();
				if (
					(value.startsWith('"') && value.endsWith('"')) ||
					(value.startsWith("'") && value.endsWith("'"))
				) {
					value = value.slice(1, -1);
				}
				env[key.trim()] = value;
			}
		} catch {
			// Sibling .env files are optional for MCP servers.
		}
		return env;
	}

	/**
	 * Get the path to a specific MCP server directory
	 */
	getServerPath(serverName: string): string {
		for (const dir of this.mcpDirectories) {
			const serverPath = join(dir, serverName);
			if (existsSync(serverPath)) return serverPath;
		}
		return join(this.mcpDirectories[0]!, serverName);
	}
}
