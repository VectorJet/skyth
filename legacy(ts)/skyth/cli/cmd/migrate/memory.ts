import { existsSync, readdirSync, cpSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export function listDailyMarkdownFiles(memoryDir: string): string[] {
	if (!existsSync(memoryDir)) return [];
	const out: string[] = [];
	const dailyRegex = /^\d{4}-\d{2}-\d{2}(?:[-_].*)?\.md$/i;

	for (const entry of readdirSync(memoryDir)) {
		const path = join(memoryDir, entry);
		const stats = statSync(path);
		if (stats.isFile() && dailyRegex.test(entry)) out.push(path);
	}

	const dailyDir = join(memoryDir, "daily");
	if (existsSync(dailyDir)) {
		for (const entry of readdirSync(dailyDir)) {
			const path = join(dailyDir, entry);
			const stats = statSync(path);
			if (stats.isFile() && entry.toLowerCase().endsWith(".md")) out.push(path);
		}
	}
	return out;
}

export function copyDailyMarkdownFiles(
	sourceMemoryDir: string,
	targetMemoryDir: string,
	toOpenclaw = false,
): number {
	const files = listDailyMarkdownFiles(sourceMemoryDir);
	// When migrating to OpenClaw, copy files to root of memory folder (not daily subdirectory)
	// to match OpenClaw's expected structure
	const target = toOpenclaw ? targetMemoryDir : join(targetMemoryDir, "daily");
	mkdirSync(target, { recursive: true });
	for (const file of files) {
		cpSync(file, join(target, file.split("/").at(-1)!), { force: true });
	}
	return files.length;
}

export function copyHeartbeatState(
	sourceWorkspace: string,
	targetWorkspace: string,
): boolean {
	const source = join(sourceWorkspace, "memory", "heartbeat-state.json");
	const target = join(targetWorkspace, "memory", "heartbeat-state.json");
	if (!existsSync(source)) return false;
	mkdirSync(dirname(target), { recursive: true });
	cpSync(source, target, { force: true });
	return true;
}
