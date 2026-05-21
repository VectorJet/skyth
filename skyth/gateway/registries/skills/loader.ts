import * as fs from "fs/promises";
import * as path from "path";
import { homedir } from "os";
import type { SkillDefinition } from "@/gateway/registries/skills/types.ts";
import type { ToolAxMetadata } from "@/gateway/registries/tools/types.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/registry.ts";
import type { HookManager } from "@/gateway/hooks/index.ts";
import type { LoadCandidate } from "@/gateway/core/contracts/index.ts";

export const DEFAULT_SKILLS_DIR =
	process.env.CLAUDE_GATEWAY_SKILLS_DIR ||
	path.join(
		process.env.CLAUDE_GATEWAY_WORKSPACE ||
			path.join(homedir(), ".claude-gateway", "workspaces"),
		"default",
		"SKILLS",
	);

export const BUILTIN_SKILLS_DIR =
	process.env.CLAUDE_GATEWAY_BUILTIN_SKILLS_DIR ||
	path.join(process.cwd(), "src", "builtin", "skills");
export const AGENT_SKILLS_DIR =
	process.env.CLAUDE_GATEWAY_AGENT_SKILLS_DIR ||
	path.join(homedir(), ".agents", "skills");
export const WORKSPACE_SKILLS_DIR = path.join(
	process.env.CLAUDE_GATEWAY_WORKSPACE ||
		path.join(homedir(), ".claude-gateway", "workspaces"),
	"default",
	"SKILLS",
);

export interface SkillDirectorySource {
	dir: string;
	source: string;
	writable?: boolean;
}

const SKILL_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;

export function slugifySkillName(input: string): string {
	const slug = String(input ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	if (!slug) throw new Error("Skill name cannot be empty.");
	if (!SKILL_NAME_RE.test(slug)) {
		throw new Error(
			"Skill name must start with a letter or number and contain only letters, numbers, dots, underscores, and hyphens.",
		);
	}
	return slug;
}

export function safeSkillRelativePath(relativePath: string): string {
	const normalized = path.posix.normalize(
		String(relativePath ?? "").replace(/\\/g, "/"),
	);
	if (
		!normalized ||
		normalized === "." ||
		normalized.startsWith("../") ||
		path.isAbsolute(normalized)
	) {
		throw new Error(`Invalid skill resource path: ${relativePath}`);
	}
	if (normalized === "SKILL.md")
		throw new Error(
			"extraFiles cannot include SKILL.md; use body and description instead.",
		);
	return normalized;
}

function parseFrontmatter(content: string): {
	frontmatter: Record<string, string>;
	body: string;
} {
	if (!content.startsWith("---\n")) return { frontmatter: {}, body: content };
	const end = content.indexOf("\n---", 4);
	if (end === -1) return { frontmatter: {}, body: content };

	const raw = content.slice(4, end).trim();
	const bodyStart = content.indexOf("\n", end + 4);
	const body = bodyStart === -1 ? "" : content.slice(bodyStart + 1);
	const frontmatter: Record<string, string> = {};
	for (const line of raw.split("\n")) {
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		let value = line.slice(idx + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		)
			value = value.slice(1, -1);
		if (key) frontmatter[key] = value;
	}
	return { frontmatter, body };
}

async function readSkillAxMetadata(
	skillPath: string,
): Promise<ToolAxMetadata | undefined> {
	const candidates = ["AX.json", "ax.json", ".gateway-ax.json"];
	for (const file of candidates) {
		const fullPath = path.join(skillPath, file);
		try {
			const raw = await fs.readFile(fullPath, "utf8");
			const parsed = JSON.parse(raw) as ToolAxMetadata;
			return parsed && typeof parsed === "object" ? parsed : undefined;
		} catch (error: any) {
			if (error?.code === "ENOENT") continue;
			console.warn(
				`[SkillLoader] Ignoring invalid AX sidecar ${fullPath}: ${error?.message || String(error)}`,
			);
		}
	}
	return undefined;
}

async function listResourceFiles(dir: string): Promise<string[]> {
	const resources: string[] = [];
	async function walk(current: string): Promise<void> {
		let entries: any[] = [];
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			const rel = path.relative(dir, full).replace(/\\/g, "/");
			if (entry.isDirectory()) {
				if (entry.name === ".git" || entry.name === "node_modules") continue;
				await walk(full);
			} else if (entry.isFile() && rel !== "SKILL.md") {
				resources.push(rel);
			}
		}
	}
	await walk(dir);
	return resources.sort((a, b) => a.localeCompare(b));
}

export function buildSkillMarkdown(
	name: string,
	description: string,
	body?: string,
): string {
	const safeName = slugifySkillName(name);
	const desc = String(description ?? "").trim();
	if (!desc) throw new Error("description is required.");
	const trimmedBody = String(body ?? "").trim();
	const title = safeName
		.split(/[-_]+/g)
		.filter(Boolean)
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
		.join(" ");
	return [
		"---",
		`name: ${safeName}`,
		`description: ${desc.replace(/\n/g, " ")}`,
		"---",
		"",
		trimmedBody ||
			`# ${title}\n\n## When to use\n\nUse this skill when the user needs ${desc}\n\n## Workflow\n\n1. Clarify the user's goal and constraints.\n2. Follow the relevant steps for the task.\n3. Report assumptions, outputs, and any files created.`,
		"",
	].join("\n");
}

export class SkillLoader {
	private sources: SkillDirectorySource[];

	constructor(
		sources?: Array<string | SkillDirectorySource>,
		private options: { hooks?: HookManager } = {},
	) {
		if (sources && sources.length > 0) {
			this.sources = sources.map((source, index) =>
				typeof source === "string"
					? {
							dir: source,
							source: index === 0 ? "builtin" : "workspace",
							writable: index !== 0,
						}
					: source,
			);
		} else if (process.env.CLAUDE_GATEWAY_SKILLS_DIR) {
			this.sources = [
				{ dir: DEFAULT_SKILLS_DIR, source: "configured", writable: true },
			];
		} else {
			this.sources = [
				{ dir: BUILTIN_SKILLS_DIR, source: "builtin", writable: false },
				{ dir: AGENT_SKILLS_DIR, source: "agents", writable: false },
				{ dir: WORKSPACE_SKILLS_DIR, source: "workspace", writable: true },
			];
		}
	}

	get root(): string {
		return this.sources
			.map((source) => `${source.source}:${source.dir}`)
			.join(", ");
	}

	get writableRoot(): string {
		return (this.sources.find((source) => source.writable) || this.sources[0]!)
			.dir;
	}

	async ensureRoot(): Promise<void> {
		await fs.mkdir(this.writableRoot, { recursive: true });
	}

	skillDir(name: string): string {
		return path.join(this.writableRoot, slugifySkillName(name));
	}

	async scanSkills(): Promise<Map<string, { dir: string; source: string }>> {
		await this.ensureRoot();
		const skills = new Map<string, { dir: string; source: string }>();
		for (const source of this.sources) {
			let entries: any[] = [];
			try {
				entries = await fs.readdir(source.dir, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				const dir = path.join(source.dir, entry.name);
				try {
					await fs.access(path.join(dir, "SKILL.md"));
					// Later sources override earlier ones, so workspace skills can shadow built-ins.
					skills.set(entry.name, { dir, source: source.source });
				} catch {}
			}
		}
		return skills;
	}

	async loadSkill(skillPath: string): Promise<SkillDefinition | null> {
		try {
			const skillFile = path.join(skillPath, "SKILL.md");
			const content = await fs.readFile(skillFile, "utf8");
			const parsed = parseFrontmatter(content);
			const name = slugifySkillName(
				parsed.frontmatter.name || path.basename(skillPath),
			);
			const description = parsed.frontmatter.description || "";
			if (!description)
				throw new Error(`Skill ${name} is missing frontmatter description`);
			return {
				name,
				description,
				path: skillPath,
				skillFile,
				frontmatter: parsed.frontmatter,
				resources: await listResourceFiles(skillPath),
				ax: await readSkillAxMetadata(skillPath),
			};
		} catch (error: any) {
			console.error(
				`[SkillLoader] Failed to load skill from ${skillPath}: ${error.message}`,
			);
			return null;
		}
	}

	async loadAllSkills(registry: SkillRegistry): Promise<void> {
		console.log(`[SkillLoader] Loading skills from ${this.root}`);
		const scanned = await this.scanSkills();
		for (const [, entry] of scanned.entries()) {
			const skill = await this.loadSkill(entry.dir);
			if (skill) {
				await this.runHooks(skill, entry.source);
				registry.register(skill, entry.source);
			}
		}
		console.log(`[SkillLoader] Loaded ${scanned.size} skill candidate(s)`);
	}

	private async runHooks(
		skill: SkillDefinition,
		sourceName: string,
	): Promise<void> {
		if (!this.options.hooks) return;
		const source =
			this.sources.find(
				(item) => item.source === sourceName && skill.path.startsWith(item.dir),
			) || this.sources.find((item) => skill.path.startsWith(item.dir));
		if (!source) return;
		const candidate: LoadCandidate = {
			kind: "skill",
			name: skill.name,
			source: {
				kind: source.source === "builtin" ? "builtin" : "workspace",
				label: `${source.source}-skills`,
				root: source.dir,
				writable: Boolean(source.writable),
				trustLevel: source.source === "builtin" ? "trusted" : "local",
				capabilities: ["skill"],
			},
			root: skill.path,
			files: ["SKILL.md", ...skill.resources],
			metadata: { ax: skill.ax, frontmatter: skill.frontmatter },
		};
		await this.options.hooks.run(candidate);
	}

	async readSkillInstructions(skill: SkillDefinition): Promise<string> {
		const content = await fs.readFile(skill.skillFile, "utf8");
		return parseFrontmatter(content).body;
	}

	async createSkill(input: {
		name: string;
		description: string;
		body?: string;
		overwrite?: boolean;
		extraFiles?: Record<string, string>;
		ax?: ToolAxMetadata;
	}): Promise<SkillDefinition> {
		await this.ensureRoot();
		const name = slugifySkillName(input.name);
		const dir = this.skillDir(name);
		const skillFile = path.join(dir, "SKILL.md");
		const overwrite = Boolean(input.overwrite ?? false);
		try {
			await fs.access(skillFile);
			if (!overwrite)
				throw new Error(
					`Skill already exists: ${name}. Pass overwrite:true to replace it.`,
				);
		} catch (error: any) {
			if (error.code !== "ENOENT") throw error;
		}
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(
			skillFile,
			buildSkillMarkdown(name, input.description, input.body),
			"utf8",
		);
		if (input.ax) {
			await fs.writeFile(
				path.join(dir, "AX.json"),
				JSON.stringify(input.ax, null, 2) + "\n",
				"utf8",
			);
		}
		for (const [rawRel, content] of Object.entries(input.extraFiles || {})) {
			const rel = safeSkillRelativePath(rawRel);
			const target = path.join(dir, rel);
			await fs.mkdir(path.dirname(target), { recursive: true });
			if (!overwrite) {
				try {
					await fs.access(target);
					throw new Error(
						`Resource already exists: ${rel}. Pass overwrite:true to replace it.`,
					);
				} catch (error: any) {
					if (error.code !== "ENOENT") throw error;
				}
			}
			await fs.writeFile(target, String(content), "utf8");
		}
		const loaded = await this.loadSkill(dir);
		if (!loaded)
			throw new Error(`Created skill ${name}, but it could not be loaded.`);
		return loaded;
	}
}
