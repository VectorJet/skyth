import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type {
	ClaudeExportConversation,
	ClaudeExportMessage,
	ConcreteEmbeddingProvider,
	EmbeddingProvider,
} from "@/gateway/memory/store/types.ts";

const CHUNK_SIZE = Number(process.env.CLAUDE_GATEWAY_MEMORY_CHUNK_SIZE ?? 1200);
const CHUNK_OVERLAP = Number(
	process.env.CLAUDE_GATEWAY_MEMORY_CHUNK_OVERLAP ?? 160,
);

export function nowIso(): string {
	return new Date().toISOString();
}

export function stableId(parts: string[]): string {
	return createHash("sha256")
		.update(parts.join("\0"))
		.digest("hex")
		.slice(0, 32);
}

export function normalizeText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

export function loadDotEnv(): Record<string, string> {
	const values: Record<string, string> = {};
	const candidates = [".env", "../.env"];
	for (const file of candidates) {
		if (!existsSync(file)) continue;
		const body = readFileSync(file, "utf8");
		for (const line of body.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const index = trimmed.indexOf("=");
			if (index === -1) continue;
			const key = trimmed.slice(0, index).trim();
			values[key] = trimmed
				.slice(index + 1)
				.trim()
				.replace(/^[""]|[""]$/g, "");
		}
	}
	return values;
}

export function loadEnvValue(name: string): string | undefined {
	if (process.env[name]) return process.env[name];
	return loadDotEnv()[name];
}

export function normalizeVector(values: number[]): {
	values: Float32Array;
	norm: number;
} {
	let sum = 0;
	for (const value of values) sum += value * value;
	const norm = Math.sqrt(sum) || 1;
	const normalized = new Float32Array(values.length);
	for (let i = 0; i < values.length; i++) normalized[i] = values[i]! / norm;
	return { values: normalized, norm };
}

export function vectorToBlob(values: Float32Array): Buffer {
	return Buffer.from(values.buffer, values.byteOffset, values.byteLength);
}

export function blobToVector(blob: Buffer | Uint8Array): Float32Array {
	const bytes = blob instanceof Buffer ? blob : Buffer.from(blob);
	return new Float32Array(
		bytes.buffer,
		bytes.byteOffset,
		Math.floor(bytes.byteLength / 4),
	);
}

export function dot(a: Float32Array, b: Float32Array): number {
	const n = Math.min(a.length, b.length);
	let score = 0;
	for (let i = 0; i < n; i++) score += a[i]! * b[i]!;
	return score;
}

export function geminiModelName(model: string): string {
	return model.startsWith("models/") ? model : `models/${model}`;
}

export function retrievalDocumentText(
	text: string,
	title?: string | null,
): string {
	return `title: ${title?.trim() || "none"} | text: ${text}`;
}

export function retrievalQueryText(query: string): string {
	return `task: question answering | query: ${query}`;
}

export function localEmbeddingModelName(model: string): string {
	if (!model || model === "embeddinggemma-300m")
		return "google/embeddinggemma-300m";
	return model;
}

export function defaultEmbeddingProvider(model?: string): EmbeddingProvider {
	const configured = process.env.CLAUDE_GATEWAY_EMBEDDING_PROVIDER;
	if (
		configured === "auto" ||
		configured === "gemini" ||
		configured === "modal" ||
		configured === "local"
	)
		return configured;
	return "auto";
}

export function isGeminiModel(model: string): boolean {
	return model.startsWith("gemini") || model.startsWith("models/gemini");
}

export function providerStorageName(
	provider: ConcreteEmbeddingProvider,
): string {
	return provider === "modal" ? "modal-local" : provider;
}

export function canProviderEmbedModel(
	provider: ConcreteEmbeddingProvider,
	model: string,
): boolean {
	return provider === "gemini" ? isGeminiModel(model) : !isGeminiModel(model);
}

export function embeddingProviderChain(
	provider: EmbeddingProvider,
	model: string,
): ConcreteEmbeddingProvider[] {
	const raw =
		provider === "auto"
			? (process.env.CLAUDE_GATEWAY_EMBEDDING_FALLBACK_CHAIN ??
				"gemini,modal,local")
			: provider;
	const candidates = raw
		.split(",")
		.map((item) => item.trim())
		.filter(
			(item): item is ConcreteEmbeddingProvider =>
				item === "gemini" || item === "modal" || item === "local",
		)
		.filter((item) => canProviderEmbedModel(item, model));
	return [...new Set(candidates)];
}

export function modalEmbeddingCommand(): { command: string; args: string[] } {
	const script = join(process.cwd(), "scripts", "modal_embedding_backfill.py");
	const modal = process.env.CLAUDE_GATEWAY_MODAL_COMMAND ?? "modal";
	return { command: modal, args: ["run", script] };
}

export function localEmbeddingCommand(): { command: string; args: string[] } {
	const script = join(process.cwd(), "scripts", "embed_local.py");
	const requirements = join(
		process.cwd(),
		"scripts",
		"embedding-requirements.txt",
	);
	const python = process.env.CLAUDE_GATEWAY_LOCAL_EMBEDDING_PYTHON;
	if (python) return { command: python, args: [script] };
	return {
		command: "uv",
		args: ["run", "--no-project", "--with-requirements", requirements, script],
	};
}

export function runLocalEmbeddingHelper(
	args: string[],
	input?: unknown,
	options: { timeoutMs?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
	const base = localEmbeddingCommand();
	return new Promise((resolve, reject) => {
		const child = spawn(base.command, [...base.args, ...args], {
			cwd: process.cwd(),
			env: { ...loadDotEnv(), ...process.env },
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		const timer = options.timeoutMs
			? setTimeout(() => {
					child.kill("SIGTERM");
					reject(
						new Error(
							`Local embedding helper timed out after ${options.timeoutMs}ms`,
						),
					);
				}, options.timeoutMs)
			: null;
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
			const lines = chunk.toString().trim().split(/\r?\n/).filter(Boolean);
			for (const line of lines) console.log(`[memory:local-embed] ${line}`);
		});
		child.on("error", (err) => {
			if (timer) clearTimeout(timer);
			reject(err);
		});
		child.on("close", (code) => {
			if (timer) clearTimeout(timer);
			if (code === 0) resolve({ stdout, stderr });
			else
				reject(
					new Error(
						`Local embedding helper failed with code ${code}: ${stderr}`,
					),
				);
		});
		if (input !== undefined) {
			child.stdin.write(JSON.stringify(input));
		}
		child.stdin.end();
	});
}

export function runModalEmbeddingHelper(
	args: string[],
	input?: unknown,
	options: { timeoutMs?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
	const base = modalEmbeddingCommand();
	return new Promise((resolve, reject) => {
		const child = spawn(base.command, [...base.args, ...args], {
			cwd: process.cwd(),
			env: { ...loadDotEnv(), ...process.env },
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		const timer = options.timeoutMs
			? setTimeout(() => {
					child.kill("SIGTERM");
					reject(
						new Error(
							`Modal embedding helper timed out after ${options.timeoutMs}ms`,
						),
					);
				}, options.timeoutMs)
			: null;
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
			const lines = chunk.toString().trim().split(/\r?\n/).filter(Boolean);
			for (const line of lines) console.log(`[memory:modal-embed] ${line}`);
		});
		child.on("error", (err) => {
			if (timer) clearTimeout(timer);
			reject(err);
		});
		child.on("close", (code) => {
			if (timer) clearTimeout(timer);
			if (code === 0) resolve({ stdout, stderr });
			else
				reject(
					new Error(
						`Modal embedding helper failed with code ${code}: ${stderr || stdout}`,
					),
				);
		});
		if (input !== undefined) {
			child.stdin.write(JSON.stringify(input));
		}
		child.stdin.end();
	});
}

export function messageText(message: ClaudeExportMessage): string {
	if (Array.isArray(message.content)) {
		const text = message.content
			.map((block) => (typeof block?.text === "string" ? block.text : ""))
			.filter(Boolean)
			.join("\n\n")
			.trim();
		if (text) return text;
	}
	return typeof message.text === "string" ? message.text.trim() : "";
}

export function chunkText(text: string): string[] {
	const cleaned = text.trim();
	if (!cleaned) return [];
	if (cleaned.length <= CHUNK_SIZE) return [cleaned];

	const chunks: string[] = [];
	let start = 0;
	while (start < cleaned.length) {
		const end = Math.min(cleaned.length, start + CHUNK_SIZE);
		chunks.push(cleaned.slice(start, end).trim());
		if (end >= cleaned.length) break;
		start = Math.max(0, end - CHUNK_OVERLAP);
	}
	return chunks.filter(Boolean);
}

export function ftsQuery(input: string): string {
	const terms = input
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, " ")
		.split(/\s+/)
		.filter((term) => term.length > 2)
		.slice(0, 12);

	if (terms.length === 0) {
		return input.replace(/"/g, " ").trim();
	}

	return terms.map((term) => `${term.replace(/"/g, "")}*`).join(" OR ");
}

export function claudeConversationId(threadId: string): string {
	const trimmed = threadId.trim();
	if (!trimmed) throw new Error("threadId is required");
	return trimmed.startsWith("claude:") || trimmed.startsWith("gateway:")
		? trimmed
		: `claude:${trimmed}`;
}

export function publicThreadId(
	conversationId: string,
	externalUuid?: string | null,
): string {
	if (externalUuid) return externalUuid;
	return conversationId.startsWith("claude:")
		? conversationId.slice("claude:".length)
		: conversationId;
}

export function safeFilePart(input: string): string {
	return input.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 120) || "thread";
}

export function safeJsonObject(
	text: string | null | undefined,
): Record<string, unknown> | null {
	if (!text) return null;
	try {
		const parsed = JSON.parse(text);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

export function reconstructBranch(
	conversation: ClaudeExportConversation,
): ClaudeExportMessage[] {
	const messages = conversation.chat_messages ?? [];
	const leaf = conversation.current_leaf_message_uuid;
	if (!leaf) return messages;

	const byId = new Map<string, ClaudeExportMessage>();
	for (const msg of messages) {
		if (msg.uuid) byId.set(msg.uuid, msg);
	}

	const branch: ClaudeExportMessage[] = [];
	let current: string | undefined | null = leaf;
	const seen = new Set<string>();
	while (current && byId.has(current) && !seen.has(current)) {
		seen.add(current);
		const msg: ClaudeExportMessage = byId.get(current)!;
		branch.unshift(msg);
		current = msg.parent_message_uuid;
	}
	return branch.length > 0 ? branch : messages;
}
