import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { ensureDir, safeFilename } from "@/utils/helpers";
import { SessionGraph } from "@/session/graph";
import { Session } from "./session";
import type { SessionMessage } from "./types";
import { getSessionListItem, listSessions, listSessionsAsync } from "./listing";

export { Session };
export type { SessionMessage };

export class SessionManager {
	private readonly workspace: string;
	private readonly sessionsDir: string;
	private readonly legacySessionsDir: string;
	private readonly cache = new Map<string, Session>();
	readonly graph: SessionGraph;
	readonly modelContextWindow?: number;

	constructor(
		workspace: string,
		sessionGraphConfig?: {
			auto_merge_on_switch?: boolean;
			persist_to_disk?: boolean;
			max_switch_history?: number;
			model_context_window?: number;
		},
	) {
		this.workspace = workspace;
		this.sessionsDir = ensureDir(join(workspace, "sessions"));
		this.legacySessionsDir = join(homedir(), ".skyth", "sessions");
		this.modelContextWindow = sessionGraphConfig?.model_context_window;

		const maxHistory = sessionGraphConfig?.max_switch_history ?? 20;
		const shouldPersist = sessionGraphConfig?.persist_to_disk ?? true;

		if (shouldPersist) {
			this.graph = SessionGraph.load(workspace, maxHistory);
		} else {
			this.graph = new SessionGraph();
		}
	}

	shouldMerge(
		sourceKey: string,
		targetKey: string,
		sourceSession: Session,
		targetSession: Session,
		thresholdMs: number,
		minTokensToMerge = 500,
	): {
		shouldMerge: boolean;
		reason: string;
		sourceTokens: number;
		targetTokens: number;
	} {
		const sourceTokens = sourceSession.estimateTokenCount();
		const targetTokens = targetSession.estimateTokenCount();

		if (sourceTokens < minTokensToMerge && targetTokens < minTokensToMerge) {
			return {
				shouldMerge: false,
				reason: `Both sessions too small (${sourceTokens} + ${targetTokens} tokens < ${minTokensToMerge})`,
				sourceTokens,
				targetTokens,
			};
		}

		if (sourceTokens < minTokensToMerge) {
			return {
				shouldMerge: false,
				reason: `Source session too small (${sourceTokens} tokens < ${minTokensToMerge})`,
				sourceTokens,
				targetTokens,
			};
		}

		if (this.modelContextWindow) {
			const estimatedSummaryTokens = Math.min(sourceTokens, 500);
			const combinedTokens = estimatedSummaryTokens + targetTokens;
			const threshold = this.modelContextWindow * 0.8;

			if (combinedTokens > threshold) {
				return {
					shouldMerge: false,
					reason: `Target context (${targetTokens}) + estimated summary (~${estimatedSummaryTokens}) would exceed 80% of model window (${threshold})`,
					sourceTokens,
					targetTokens,
				};
			}
		}

		return { shouldMerge: true, reason: "OK", sourceTokens, targetTokens };
	}

	needsCompaction(
		session: Session,
		thresholdPercent = 80,
	): {
		needsCompaction: boolean;
		currentTokens: number;
		contextLimit: number;
		percentUsed: number;
	} {
		if (!this.modelContextWindow) {
			return {
				needsCompaction: false,
				currentTokens: 0,
				contextLimit: 0,
				percentUsed: 0,
			};
		}

		const currentTokens = session.estimateTokenCount();
		const threshold = (this.modelContextWindow * thresholdPercent) / 100;
		const percentUsed = (currentTokens / this.modelContextWindow) * 100;

		return {
			needsCompaction: currentTokens > threshold,
			currentTokens,
			contextLimit: this.modelContextWindow,
			percentUsed,
		};
	}

	saveAll(): void {
		this.graph.save();
	}

	async compactSession(
		session: Session,
		summarizeFn: (messages: SessionMessage[]) => Promise<string>,
		minMessagesToKeep = 10,
	): Promise<{
		success: boolean;
		summary: string;
		originalMessages: number;
		remainingMessages: number;
	}> {
		if (session.messages.length <= minMessagesToKeep) {
			return {
				success: false,
				summary: "Session too small to compact",
				originalMessages: session.messages.length,
				remainingMessages: session.messages.length,
			};
		}

		const messagesToSummarize = session.messages.slice(0, -minMessagesToKeep);
		const messagesToKeep = session.messages.slice(-minMessagesToKeep);

		const summary = await summarizeFn(messagesToSummarize);

		session.messages = [
			{
				role: "system",
				content: `[SESSION COMPACTED - ${messagesToSummarize.length} messages summarized]\n\n${summary}`,
				timestamp: new Date().toISOString(),
				_compacted: true,
				_compactedFrom: messagesToSummarize.length,
			},
			...messagesToKeep,
		];

		session.lastConsolidated = session.messages.length;
		this.save(session);

		return {
			success: true,
			summary,
			originalMessages: messagesToSummarize.length + minMessagesToKeep,
			remainingMessages: session.messages.length,
		};
	}

	private getSessionPath(key: string): string {
		return join(
			this.sessionsDir,
			`${safeFilename(key.replace(":", "_"))}.jsonl`,
		);
	}

	private getLegacySessionPath(key: string): string {
		return join(
			this.legacySessionsDir,
			`${safeFilename(key.replace(":", "_"))}.jsonl`,
		);
	}

	async getMany(keys: string[]): Promise<Session[]> {
		const concurrencyLimit = 50;
		const sessions: Session[] = [];

		for (let i = 0; i < keys.length; i += concurrencyLimit) {
			const batch = keys.slice(i, i + concurrencyLimit);
			const batchResults = await Promise.all(
				batch.map(async (key) => {
					const hit = this.cache.get(key);
					if (hit) return hit;

					const loaded = (await this.loadAsync(key)) ?? new Session(key);
					this.cache.set(key, loaded);
					this.graph.addSession(key);
					return loaded;
				}),
			);
			sessions.push(...batchResults);
		}

		return sessions;
	}

	private async loadAsync(key: string): Promise<Session | undefined> {
		const path = this.getSessionPath(key);
		if (!existsSync(path)) {
			const legacyPath = this.getLegacySessionPath(key);
			if (existsSync(legacyPath)) {
				mkdirSync(this.sessionsDir, { recursive: true });
				renameSync(legacyPath, path);
			}
		}
		if (!existsSync(path)) return undefined;

		try {
			const content = await readFile(path, "utf-8");
			const lines = content.split(/\r?\n/).filter(Boolean);
			const session = new Session(key);
			for (const line of lines) {
				const data = JSON.parse(line);
				if (data._type === "metadata") {
					if (data.id) session.id = data.id;
					if (data.name) session.name = data.name;
					session.metadata = data.metadata ?? {};
					if (data.created_at) session.createdAt = new Date(data.created_at);
					if (data.updated_at) session.updatedAt = new Date(data.updated_at);
					session.lastConsolidated = Number(data.last_consolidated ?? 0);
				} else {
					session.messages.push(data);
				}
			}
			return session;
		} catch {
			return undefined;
		}
	}

	getOrCreate(key: string): Session {
		const hit = this.cache.get(key);
		if (hit) return hit;

		const loaded = this.load(key) ?? new Session(key);
		this.cache.set(key, loaded);
		this.graph.addSession(key);
		return loaded;
	}

	private load(key: string): Session | undefined {
		const path = this.getSessionPath(key);
		if (!existsSync(path)) {
			const legacyPath = this.getLegacySessionPath(key);
			if (existsSync(legacyPath)) {
				mkdirSync(this.sessionsDir, { recursive: true });
				renameSync(legacyPath, path);
			}
		}
		if (!existsSync(path)) return undefined;

		try {
			const lines = readFileSync(path, "utf-8").split(/\r?\n/).filter(Boolean);
			const session = new Session(key);
			for (const line of lines) {
				const data = JSON.parse(line);
				if (data._type === "metadata") {
					if (data.id) session.id = data.id;
					if (data.name) session.name = data.name;
					session.metadata = data.metadata ?? {};
					if (data.created_at) session.createdAt = new Date(data.created_at);
					if (data.updated_at) session.updatedAt = new Date(data.updated_at);
					session.lastConsolidated = Number(data.last_consolidated ?? 0);
				} else {
					session.messages.push(data);
				}
			}
			return session;
		} catch {
			return undefined;
		}
	}

	save(session: Session): void {
		const path = this.getSessionPath(session.key);
		mkdirSync(this.sessionsDir, { recursive: true });
		const lines = [
			JSON.stringify({
				_type: "metadata",
				id: session.id,
				key: session.key,
				name: session.name,
				created_at: session.createdAt.toISOString(),
				updated_at: session.updatedAt.toISOString(),
				metadata: session.metadata,
				last_consolidated: session.lastConsolidated,
			}),
		];
		for (const msg of session.messages) lines.push(JSON.stringify(msg));
		writeFileSync(path, `${lines.join("\n")}\n`, "utf-8");
		this.cache.set(session.key, session);
	}

	invalidate(key: string): void {
		this.cache.delete(key);
	}

	getSessionListItem(session: Session): Record<string, any> {
		return getSessionListItem(session, this.sessionsDir);
	}

	listSessions(): Array<Record<string, any>> {
		return listSessions(this.sessionsDir);
	}

	async listSessionsAsync(): Promise<Array<Record<string, any>>> {
		return listSessionsAsync(this.sessionsDir);
	}
}
