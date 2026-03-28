import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, extname } from "node:path";
import { channelsEditCommand } from "@/cli/cmd/channels";
import { loadConfig, saveConfig } from "@/config/loader";
import { safeFilename } from "@/utils/helpers";

import { ensureDir, readJson, writeJson } from "./utils";
import {
	safeSessionPath,
	copyDirectoryContents,
	parseOpenClawSessionKeyIndex,
	convertOpenClawSession,
	writeSkythSession,
	convertSkythSession,
} from "./sessions";
import { convertOpenClawCronJobs, convertSkythCronJobs } from "./cron";
import { copyDailyMarkdownFiles, copyHeartbeatState } from "./memory";

type Direction = "from" | "to";
type Target = "openclaw";

export interface MigrateArgs {
	direction?: string;
	target?: string;
}

export interface MigrateResult {
	exitCode: number;
	output: string;
}

function usage(): string {
	return [
		"Usage: skyth migrate <from|to> openclaw",
		"",
		"Examples:",
		"  skyth migrate from openclaw",
		"  skyth migrate to openclaw",
	].join("\n");
}

function migrateOpenClawToSkyth(): MigrateResult {
	const home = process.env.HOME || homedir();
	const openclawRoot = join(home, ".openclaw");
	const skythRoot = join(home, ".skyth");

	if (!existsSync(openclawRoot)) {
		return { exitCode: 1, output: `Error: source not found: ${openclawRoot}` };
	}

	const openclawWorkspace = join(openclawRoot, "workspace");
	const skythWorkspace = join(skythRoot, "workspace");
	ensureDir(skythRoot);
	ensureDir(skythWorkspace);

	const copiedWorkspaceEntries = copyDirectoryContents(
		openclawWorkspace,
		skythWorkspace,
		new Set(["memory"]),
	);
	const copiedAgentEntries = copyDirectoryContents(
		join(openclawRoot, "agents"),
		join(skythWorkspace, "agents"),
	);

	let convertedSessions = 0;
	const openclawSessionsDir = join(openclawRoot, "agents", "main", "sessions");
	const sessionIndex = parseOpenClawSessionKeyIndex(
		join(openclawSessionsDir, "sessions.json"),
	);
	if (existsSync(openclawSessionsDir)) {
		const usedPaths = new Set<string>();
		for (const file of readdirSync(openclawSessionsDir)) {
			if (extname(file) !== ".jsonl") continue;
			if (file.endsWith(".jsonl.lock")) continue;
			const converted = convertOpenClawSession(
				join(openclawSessionsDir, file),
				sessionIndex,
			);
			if (!converted) continue;
			let key = converted.key;
			let targetPath = safeSessionPath(skythWorkspace, key);
			if (usedPaths.has(targetPath)) {
				key = String(converted.metadata.session_id ?? key);
				targetPath = safeSessionPath(skythWorkspace, key);
			}
			converted.key = key;
			writeSkythSession(skythWorkspace, converted);
			usedPaths.add(targetPath);
			convertedSessions += 1;
		}
	}

	const copiedDailyFiles = copyDailyMarkdownFiles(
		join(openclawWorkspace, "memory"),
		join(skythWorkspace, "memory"),
	);

	const copiedHeartbeatStateResult = copyHeartbeatState(
		openclawWorkspace,
		skythWorkspace,
	);

	const convertedCronJobs = convertOpenClawCronJobs(
		join(openclawRoot, "cron", "jobs.json"),
		join(skythRoot, "cron", "jobs.json"),
	);
	const copiedCronRuns = copyDirectoryContents(
		join(openclawRoot, "cron", "runs"),
		join(skythRoot, "cron", "runs"),
	);

	const openclawCfg = readJson<Record<string, any>>(
		join(openclawRoot, "openclaw.json"),
		{},
	);
	const telegramAllow = readJson<{ allowFrom?: unknown[] }>(
		join(openclawRoot, "credentials", "telegram-allowFrom.json"),
		{ allowFrom: [] },
	);
	const allowFrom = Array.isArray(telegramAllow.allowFrom)
		? telegramAllow.allowFrom
				.map((value) => String(value ?? "").trim())
				.filter(Boolean)
		: [];
	const telegramConfig = openclawCfg.channels?.telegram ?? {};
	const channelPatch: Record<string, unknown> = {
		enabled: Boolean(telegramConfig.enabled ?? true),
		allow_from: allowFrom,
	};
	const token = String(
		telegramConfig.botToken ?? telegramConfig.token ?? "",
	).trim();
	if (token) channelPatch.token = token;
	channelsEditCommand(
		{ channel: "telegram", json: JSON.stringify(channelPatch) },
		{
			channelsDir: join(skythRoot, "channels"),
			authDir: join(skythRoot, "auth"),
		},
	);

	const model = String(
		openclawCfg.agents?.defaults?.model?.primary ?? "",
	).trim();
	if (model) {
		const cfg = loadConfig();
		cfg.primary_model = model;
		cfg.agents.defaults.model = model;
		cfg.primary_model_provider = model.includes("/")
			? model.split("/", 1)[0] || cfg.primary_model_provider
			: cfg.primary_model_provider;
		saveConfig(cfg);
	}

	const output = [
		"Migration complete: openclaw -> skyth",
		`workspace entries copied: ${copiedWorkspaceEntries}`,
		`agent entries copied: ${copiedAgentEntries}`,
		`sessions converted: ${convertedSessions}`,
		`daily markdown files copied: ${copiedDailyFiles}`,
		`cron jobs converted: ${convertedCronJobs}`,
		`cron run files copied: ${copiedCronRuns}`,
		`heartbeat state copied: ${copiedHeartbeatStateResult ? "yes" : "no"}`,
		`telegram allowlist entries: ${allowFrom.length}`,
		model ? `primary model set: ${model}` : "primary model set: unchanged",
	].join("\n");
	return { exitCode: 0, output };
}

function migrateSkythToOpenClaw(): MigrateResult {
	const home = process.env.HOME || homedir();
	const openclawRoot = join(home, ".openclaw");
	const skythRoot = join(home, ".skyth");

	if (!existsSync(skythRoot)) {
		return { exitCode: 1, output: `Error: source not found: ${skythRoot}` };
	}

	const openclawWorkspace = join(openclawRoot, "workspace");
	const skythWorkspace = join(skythRoot, "workspace");
	ensureDir(openclawRoot);
	ensureDir(openclawWorkspace);

	const copiedWorkspaceEntries = copyDirectoryContents(
		skythWorkspace,
		openclawWorkspace,
	);
	const copiedAgentEntries = copyDirectoryContents(
		join(skythWorkspace, "agents"),
		join(openclawRoot, "agents"),
	);

	const copiedDailyFiles = copyDailyMarkdownFiles(
		join(skythWorkspace, "memory"),
		join(openclawWorkspace, "memory"),
		true, // toOpenclaw
	);

	const copiedHeartbeatStateResult = copyHeartbeatState(
		skythWorkspace,
		openclawWorkspace,
	);

	const convertedCronJobs = convertSkythCronJobs(
		join(skythRoot, "cron", "jobs.json"),
		join(openclawRoot, "cron", "jobs.json"),
	);
	const copiedCronRuns = copyDirectoryContents(
		join(skythRoot, "cron", "runs"),
		join(openclawRoot, "cron", "runs"),
	);

	let convertedSessions = 0;
	const skythSessionsDir = join(skythWorkspace, "sessions");
	const openclawSessionsDir = join(openclawRoot, "agents", "main", "sessions");
	ensureDir(openclawSessionsDir);
	const sessionIndex: Record<string, unknown> = readJson<
		Record<string, unknown>
	>(join(openclawSessionsDir, "sessions.json"), {});
	if (existsSync(skythSessionsDir)) {
		for (const file of readdirSync(skythSessionsDir)) {
			if (!file.endsWith(".jsonl")) continue;
			if (file.endsWith(".jsonl.lock")) continue;
			const converted = convertSkythSession(
				join(skythSessionsDir, file),
				openclawWorkspace,
			);
			if (!converted) continue;
			const targetPath = join(openclawSessionsDir, `${converted.id}.jsonl`);
			const lines = converted.events.map((event) => JSON.stringify(event));
			writeFileSync(targetPath, `${lines.join("\n")}\n`, "utf-8");

			const key = converted.key.includes(":")
				? converted.key
				: `agent:main:${converted.key}`;
			const to = converted.key.includes(":")
				? converted.key
				: `cli:${converted.key}`;
			const channel = to.includes(":") ? to.split(":", 1)[0] : "cli";
			sessionIndex[key] = {
				sessionId: converted.id,
				updatedAt: converted.updatedAtMs,
				systemSent: true,
				abortedLastRun: false,
				chatType: "direct",
				deliveryContext: {
					channel,
					to,
					accountId: "default",
				},
				lastTo: to,
				origin: {
					provider: channel,
					surface: channel,
					chatType: "direct",
					from: to,
					to,
					accountId: "default",
				},
				sessionFile: targetPath,
			};
			convertedSessions += 1;
		}
	}
	writeJson(join(openclawSessionsDir, "sessions.json"), sessionIndex);

	const cfg = loadConfig();
	const model = String(
		cfg.primary_model || cfg.agents.defaults.model || "",
	).trim();
	const token = String(cfg.channels.telegram?.token ?? "").trim();
	const allowFrom = Array.isArray(cfg.channels.telegram?.allow_from)
		? cfg.channels.telegram.allow_from
				.map((value) => String(value ?? "").trim())
				.filter(Boolean)
		: [];

	const openclawConfigPath = join(openclawRoot, "openclaw.json");
	const openclawCfg = readJson<Record<string, any>>(openclawConfigPath, {});
	openclawCfg.agents = openclawCfg.agents ?? {};
	openclawCfg.agents.defaults = openclawCfg.agents.defaults ?? {};
	openclawCfg.agents.defaults.workspace = openclawWorkspace;
	openclawCfg.agents.defaults.model = openclawCfg.agents.defaults.model ?? {};
	if (model) openclawCfg.agents.defaults.model.primary = model;

	openclawCfg.channels = openclawCfg.channels ?? {};
	openclawCfg.channels.telegram = openclawCfg.channels.telegram ?? {};
	openclawCfg.channels.telegram.enabled = Boolean(
		cfg.channels.telegram?.enabled,
	);
	if (token) openclawCfg.channels.telegram.botToken = token;
	if (allowFrom.length) openclawCfg.channels.telegram.allowFrom = allowFrom;
	writeJson(openclawConfigPath, openclawCfg);

	writeJson(join(openclawRoot, "credentials", "telegram-allowFrom.json"), {
		version: 1,
		allowFrom,
	});
	if (!existsSync(join(openclawRoot, "credentials", "telegram-pairing.json"))) {
		writeJson(join(openclawRoot, "credentials", "telegram-pairing.json"), {
			version: 1,
			requests: [],
		});
	}

	const output = [
		"Migration complete: skyth -> openclaw",
		`workspace entries copied: ${copiedWorkspaceEntries}`,
		`agent entries copied: ${copiedAgentEntries}`,
		`sessions converted: ${convertedSessions}`,
		`daily markdown files copied: ${copiedDailyFiles}`,
		`cron jobs converted: ${convertedCronJobs}`,
		`cron run files copied: ${copiedCronRuns}`,
		`heartbeat state copied: ${copiedHeartbeatStateResult ? "yes" : "no"}`,
		`telegram allowlist entries: ${allowFrom.length}`,
		model ? `primary model set: ${model}` : "primary model set: unchanged",
	].join("\n");
	return { exitCode: 0, output };
}

export async function migrateCommand(
	args: MigrateArgs,
): Promise<MigrateResult> {
	const direction = String(args.direction ?? "")
		.trim()
		.toLowerCase();
	const target = String(args.target ?? "")
		.trim()
		.toLowerCase();
	if (!direction || !target || target === "help" || direction === "help") {
		return { exitCode: 0, output: usage() };
	}
	if (target !== "openclaw") {
		return {
			exitCode: 1,
			output: `Error: unsupported migrate target '${target}'.\n\n${usage()}`,
		};
	}
	if (direction !== "from" && direction !== "to") {
		return {
			exitCode: 1,
			output: `Error: unsupported migrate direction '${direction}'.\n\n${usage()}`,
		};
	}
	if (
		(direction as Direction) === "from" &&
		(target as Target) === "openclaw"
	) {
		return migrateOpenClawToSkyth();
	}
	return migrateSkythToOpenClaw();
}
