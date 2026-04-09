import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, cpSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { readLines, writeJson, ensureDir, readJson } from "./utils";
import { safeFilename } from "@/utils/helpers";

interface SkythSessionDoc {
	key: string;
	createdAt: string;
	updatedAt: string;
	metadata: Record<string, unknown>;
	lastConsolidated: number;
	messages: Array<Record<string, unknown>>;
}

export function safeSessionPath(workspace: string, key: string): string {
	return join(
		workspace,
		"sessions",
		`${safeFilename(key.replace(":", "_"))}.jsonl`,
	);
}

export function copyDirectoryContents(
	sourceDir: string,
	targetDir: string,
	excludeDirs: Set<string> = new Set(),
): number {
	if (!existsSync(sourceDir)) return 0;
	ensureDir(targetDir);
	let copied = 0;
	for (const entry of readdirSync(sourceDir)) {
		if (excludeDirs.has(entry)) continue;
		const source = join(sourceDir, entry);
		const target = join(targetDir, entry);
		cpSync(source, target, {
			recursive: true,
			force: true,
			preserveTimestamps: true,
		});
		copied += 1;
	}
	return copied;
}

function flattenOpenClawContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return String(content ?? "");
	const chunks: string[] = [];
	for (const part of content) {
		if (typeof part === "string") {
			chunks.push(part);
			continue;
		}
		if (part && typeof part === "object") {
			const obj = part as Record<string, unknown>;
			if (typeof obj.text === "string") chunks.push(obj.text);
			else chunks.push(JSON.stringify(obj));
			continue;
		}
		chunks.push(String(part ?? ""));
	}
	return chunks.join("\n").trim();
}

export function parseOpenClawSessionKeyIndex(
	indexPath: string,
): Map<string, string> {
	const data = readJson<Record<string, any>>(indexPath, {});
	const out = new Map<string, string>();
	for (const [sessionKey, payload] of Object.entries(data)) {
		if (!payload || typeof payload !== "object") continue;
		const sessionId = String(payload.sessionId ?? "").trim();
		if (!sessionId) continue;
		const deliveryTo = String(
			payload.deliveryContext?.to ?? payload.origin?.to ?? "",
		).trim();
		const resolvedKey = deliveryTo || sessionKey || sessionId;
		out.set(sessionId, resolvedKey);
	}
	return out;
}

export function convertOpenClawSession(
	path: string,
	index: Map<string, string>,
): SkythSessionDoc | undefined {
	const lines = readLines(path);
	if (!lines.length) return undefined;
	const fallback = new Date().toISOString();

	let sessionId = "";
	let createdAt = fallback;
	let updatedAt = fallback;
	let lastTs = 0;
	const messages: Array<Record<string, unknown>> = [];

	for (const line of lines) {
		let event: Record<string, any>;
		try {
			event = JSON.parse(line);
		} catch {
			continue;
		}

		const ts = String(event.timestamp ?? "");
		const tsMs = Number(new Date(ts).getTime());
		if (Number.isFinite(tsMs) && tsMs > lastTs) {
			lastTs = tsMs;
			updatedAt = new Date(tsMs).toISOString();
		}

		if (event.type === "session") {
			sessionId = String(event.id ?? "").trim() || sessionId;
			if (ts) createdAt = ts;
			continue;
		}

		if (event.type !== "message") continue;
		const msg = event.message;
		if (!msg || typeof msg !== "object") continue;

		const role = String(msg.role ?? "").trim() || "assistant";
		const content = flattenOpenClawContent(
			(msg as Record<string, unknown>).content,
		);
		const messageTs = msg.timestamp ?? event.timestamp ?? Date.now();
		const messageIso =
			typeof messageTs === "number"
				? new Date(messageTs).toISOString()
				: String(messageTs || "").trim() || fallback;

		const item: Record<string, unknown> = {
			role,
			content,
			timestamp: messageIso,
		};
		for (const key of ["tool_calls", "tool_call_id", "name"]) {
			if (msg[key] !== undefined) item[key] = msg[key];
		}
		messages.push(item);
	}

	const fileBase =
		path
			.split("/")
			.at(-1)
			?.replace(/\.jsonl$/, "") ?? "";
	const resolvedId = sessionId || fileBase || `openclaw_${Date.now()}`;
	const resolvedKey = index.get(resolvedId) ?? resolvedId;
	return {
		key: resolvedKey,
		createdAt,
		updatedAt,
		metadata: {
			imported_from: "openclaw",
			session_id: resolvedId,
			source_file: path,
		},
		lastConsolidated: 0,
		messages,
	};
}

export function writeSkythSession(
	workspace: string,
	session: SkythSessionDoc,
): void {
	const sessionPath = safeSessionPath(workspace, session.key);
	ensureDir(dirname(sessionPath));
	const lines = [
		JSON.stringify({
			_type: "metadata",
			key: session.key,
			created_at: session.createdAt,
			updated_at: session.updatedAt,
			metadata: session.metadata,
			last_consolidated: session.lastConsolidated,
		}),
		...session.messages.map((message) => JSON.stringify(message)),
	];
	writeFileSync(sessionPath, `${lines.join("\n")}\n`, "utf-8");
}

export function convertSkythSession(
	path: string,
	openclawWorkspace: string,
):
	| {
			id: string;
			key: string;
			updatedAtMs: number;
			events: Array<Record<string, unknown>>;
	  }
	| undefined {
	const lines = readLines(path);
	if (!lines.length) return undefined;

	let key =
		path
			.split("/")
			.at(-1)
			?.replace(/\.jsonl$/, "") ?? "";
	let createdAt = new Date().toISOString();
	let updatedAt = createdAt;
	let parentId: string | null = null;
	const events: Array<Record<string, unknown>> = [];

	for (const line of lines) {
		let row: Record<string, any>;
		try {
			row = JSON.parse(line);
		} catch {
			continue;
		}
		if (row._type === "metadata") {
			key = String(row.key ?? key);
			createdAt = String(row.created_at ?? createdAt);
			updatedAt = String(row.updated_at ?? updatedAt);
			continue;
		}

		const id = randomBytes(4).toString("hex");
		const timestamp = String(row.timestamp ?? updatedAt);
		const role = String(row.role ?? "assistant");
		const content = String(row.content ?? "");
		events.push({
			type: "message",
			id,
			parentId,
			timestamp,
			message: {
				role,
				content: [{ type: "text", text: content }],
				timestamp: Number(new Date(timestamp).getTime()),
			},
		});
		parentId = id;
	}

	const id =
		key.replace(/[^a-zA-Z0-9_-]/g, "").slice(-36) ||
		randomBytes(16).toString("hex");
	const sessionEvent = {
		type: "session",
		version: 3,
		id,
		timestamp: createdAt,
		cwd: openclawWorkspace,
	};
	return {
		id,
		key,
		updatedAtMs: Number(new Date(updatedAt).getTime()) || Date.now(),
		events: [sessionEvent, ...events],
	};
}
