import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TEMPLATE_DIR = join(process.cwd(), "skyth", "utils", "templates");

function stripFrontMatter(content: string): string {
	if (!content.startsWith("---")) return content;
	const endIndex = content.indexOf("\n---", 3);
	if (endIndex === -1) return content;
	const start = endIndex + "\n---".length;
	return content.slice(start).replace(/^\s+/, "");
}

function loadTemplate(templateFile: string): string {
	const templatePath = join(TEMPLATE_DIR, templateFile);
	if (!existsSync(templatePath)) {
		throw new Error(`Missing onboarding template: ${templatePath}`);
	}
	try {
		const content = readFileSync(templatePath, "utf-8");
		return stripFrontMatter(content);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(
			`Failed to read onboarding template ${templatePath}: ${message}`,
		);
	}
}

function ensureWorkspaceFile(params: {
	path: string;
	label: string;
	templateFile: string;
}): string | null {
	if (existsSync(params.path)) return null;
	const content = loadTemplate(params.templateFile);
	writeFileSync(params.path, content, "utf-8");
	return `Created ${params.label}`;
}

export function ensureWorkspaceTemplates(workspace: string): string[] {
	const created: string[] = [];
	const memoryDir = join(workspace, "memory");
	const skillsDir = join(workspace, "skills");
	const agentsDir = join(workspace, "agents", "main", "sessions");
	mkdirSync(memoryDir, { recursive: true });
	mkdirSync(skillsDir, { recursive: true });
	mkdirSync(agentsDir, { recursive: true });

	const agentsPath = join(workspace, "AGENTS.md");
	const heartbeatPath = join(workspace, "HEARTBEAT.md");
	const identityPath = join(workspace, "IDENTITY.md");
	const soulPath = join(workspace, "SOUL.md");
	const toolsPath = join(workspace, "TOOLS.md");
	const userPath = join(workspace, "USER.md");
	const bootstrapPath = join(workspace, "BOOTSTRAP.md");
	const memoryPath = join(memoryDir, "MEMORY.md");
	const historyPath = join(memoryDir, "HISTORY.md");
	const mentalImagePath = join(memoryDir, "MENTAL_IMAGE.locked.md");
	const dailyDir = join(memoryDir, "daily");

	const rootFiles = [
		{
			path: agentsPath,
			label: "AGENTS.md",
			templateFile: "AGENTS.md",
		},
		{
			path: bootstrapPath,
			label: "BOOTSTRAP.md",
			templateFile: "BOOTSTRAP.md",
		},
		{
			path: heartbeatPath,
			label: "HEARTBEAT.md",
			templateFile: "HEARTBEAT.md",
		},
		{
			path: identityPath,
			label: "IDENTITY.md",
			templateFile: "IDENTITY.md",
		},
		{
			path: soulPath,
			label: "SOUL.md",
			templateFile: "SOUL.md",
		},
		{
			path: toolsPath,
			label: "TOOLS.md",
			templateFile: "TOOLS.md",
		},
		{
			path: userPath,
			label: "USER.md",
			templateFile: "USER.md",
		},
	];

	for (const file of rootFiles) {
		const status = ensureWorkspaceFile(file);
		if (status) created.push(status);
	}

	if (!existsSync(memoryPath)) {
		writeFileSync(
			memoryPath,
			[
				"# Long-term Memory",
				"",
				"Store stable user and project information here.",
				"",
				"## User",
				"",
				"",
				"## Project",
				"",
				"",
			].join("\n"),
			"utf-8",
		);
		created.push("Created memory/MEMORY.md");
	}

	if (!existsSync(historyPath)) {
		writeFileSync(historyPath, "", "utf-8");
		created.push("Created memory/HISTORY.md");
	}

	mkdirSync(dailyDir, { recursive: true });
	if (!existsSync(mentalImagePath)) {
		writeFileSync(
			mentalImagePath,
			[
				"# MENTAL_IMAGE.locked.md",
				"",
				"Private behavioral model notes.",
				"This file is intended for restricted access.",
				"",
			].join("\n"),
			"utf-8",
		);
		created.push("Created memory/MENTAL_IMAGE.locked.md");
	}

	return created;
}
