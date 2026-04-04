import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir } from "@/utils/helpers";
import type {
	MergeEdge,
	SessionBranch,
	SessionGraphData,
	UserBehaviorProfile,
} from "./graph_types";
import { BehaviorTracker } from "./graph_behavior";

const CURRENT_VERSION = "1.0";

export class SessionGraph {
	private version = CURRENT_VERSION;
	private sessions: Map<string, SessionBranch> = new Map();
	private edges: MergeEdge[] = [];
	private behaviorTracker: BehaviorTracker;
	private dirty = false;
	private workspace: string = "";

	constructor(maxSwitchHistory = 20) {
		this.behaviorTracker = new BehaviorTracker(maxSwitchHistory);
	}

	static load(workspace: string, maxSwitchHistory = 20): SessionGraph {
		const graph = new SessionGraph(maxSwitchHistory);
		graph.workspace = workspace;

		const sessionsDir = join(workspace, "sessions");
		const graphPath = join(sessionsDir, "graph.json");

		if (!existsSync(graphPath)) {
			return graph;
		}

		try {
			const data: SessionGraphData = JSON.parse(
				readFileSync(graphPath, "utf-8"),
			);
			if (data.version !== CURRENT_VERSION) {
				console.warn("[session-graph] unknown version, starting fresh");
				return graph;
			}

			for (const [key, branch] of Object.entries(data.sessions ?? {})) {
				graph.sessions.set(key, branch);
			}
			graph.edges = data.edges ?? [];
			if (data.behavior) {
				graph.behaviorTracker.setBehavior(data.behavior);
			}
		} catch (err) {
			console.error("[session-graph] failed to load graph:", err);
		}

		return graph;
	}

	save(): void {
		if (!this.dirty) return;

		const sessionsDir = join(this.workspace, "sessions");
		ensureDir(sessionsDir);
		const graphPath = join(sessionsDir, "graph.json");

		const data: SessionGraphData = {
			version: this.version,
			sessions: Object.fromEntries(this.sessions),
			edges: this.edges,
			behavior: this.behaviorTracker.getBehavior(),
		};

		writeFileSync(graphPath, JSON.stringify(data, null, 2), "utf-8");
		this.dirty = false;
	}

	saveAll(): void {
		this.save();
	}

	addSession(key: string): void {
		if (this.sessions.has(key)) return;

		this.sessions.set(key, {
			key,
			createdAt: new Date().toISOString(),
			mergedFrom: [],
		});
		this.dirty = true;
	}

	merge(
		sourceKey: string,
		targetKey: string,
		mode: "full" | "compact",
		compactedMessages?: number,
	): void {
		if (!this.sessions.has(sourceKey)) {
			this.addSession(sourceKey);
		}
		if (!this.sessions.has(targetKey)) {
			this.addSession(targetKey);
		}

		const source = this.sessions.get(sourceKey)!;
		const target = this.sessions.get(targetKey)!;

		const edge: MergeEdge = {
			id: `${sourceKey}:${targetKey}:${Date.now()}`,
			sourceKey,
			targetKey,
			timestamp: Date.now(),
			mode,
			compactedMessages,
		};

		this.edges.push(edge);

		target.mergedFrom.push(sourceKey);
		if (!target.parentKey) {
			target.parentKey = sourceKey;
		}

		this.dirty = true;
	}

	link(sourceKey: string, targetKey: string): void {
		if (!this.sessions.has(sourceKey)) {
			this.addSession(sourceKey);
		}
		if (!this.sessions.has(targetKey)) {
			this.addSession(targetKey);
		}

		const edge: MergeEdge = {
			id: `${sourceKey}:${targetKey}:${Date.now()}`,
			sourceKey,
			targetKey,
			timestamp: Date.now(),
			mode: "full",
		};

		this.edges.push(edge);
		this.dirty = true;
	}

	getAncestors(key: string): string[] {
		const visited = new Set<string>();
		const stack = [key];

		while (stack.length > 0) {
			const current = stack.pop()!;
			if (visited.has(current)) continue;
			visited.add(current);

			const branch = this.sessions.get(current);
			if (branch) {
				if (branch.parentKey) {
					stack.push(branch.parentKey);
				}
				for (const merged of branch.mergedFrom) {
					stack.push(merged);
				}
			}
		}

		visited.delete(key);
		return Array.from(visited);
	}

	getDescendants(key: string): string[] {
		const descendants = new Set<string>();

		for (const [sessionKey] of this.sessions) {
			const ancestors = this.getAncestors(sessionKey);
			if (ancestors.includes(key)) {
				descendants.add(sessionKey);
			}
		}

		descendants.delete(key);
		return Array.from(descendants);
	}

	getMergeHistory(key: string): MergeEdge[] {
		return this.edges.filter((e) => e.sourceKey === key || e.targetKey === key);
	}

	recordSwitch(fromChannel: string, toChannel: string): void {
		this.behaviorTracker.recordSwitch(fromChannel, toChannel);
		this.dirty = true;
	}

	shouldAutoMerge(
		fromKey: string,
		toKey: string,
		thresholdMs: number,
	): boolean {
		return this.behaviorTracker.shouldAutoMerge(fromKey, toKey, thresholdMs);
	}

	getLastSwitch():
		| { fromChannel: string; toChannel: string; timestamp: number }
		| undefined {
		return this.behaviorTracker.getLastSwitch();
	}

	getPreferredChannel(): string {
		return this.behaviorTracker.getPreferredChannel();
	}

	getSwitchFrequencyMs(): number {
		return this.behaviorTracker.getSwitchFrequencyMs();
	}

	getSessionCount(): number {
		return this.sessions.size;
	}

	getEdgeCount(): number {
		return this.edges.length;
	}

	getSessions(): SessionBranch[] {
		return Array.from(this.sessions.values());
	}

	getSessionMap(): Map<string, SessionBranch> {
		return new Map(this.sessions);
	}

	getSessionKeys(): string[] {
		return Array.from(this.sessions.keys());
	}

	getSessionList(): Array<{ key: string; branch: SessionBranch }> {
		return Array.from(this.sessions.entries()).map(([key, branch]) => ({
			key,
			branch,
		}));
	}

	getEdges(): MergeEdge[] {
		return [...this.edges];
	}

	getBehavior(): UserBehaviorProfile {
		return this.behaviorTracker.getBehavior();
	}

	getSession(key: string): SessionBranch | undefined {
		return this.sessions.get(key);
	}

	hasSession(key: string): boolean {
		return this.sessions.has(key);
	}

	deleteSession(key: string): void {
		if (this.sessions.delete(key)) {
			this.dirty = true;
		}
	}

	clear(): void {
		this.sessions.clear();
		this.edges = [];
		this.behaviorTracker.setBehavior({
			switchFrequencyMs: 0,
			preferredChannel: "",
			lastSwitches: [],
		});
		this.dirty = true;
	}

	visualize(): string {
		const lines: string[] = ["Session Graph:", ""];
		for (const [key, branch] of this.sessions) {
			const parent = branch.parentKey ? ` -> ${branch.parentKey}` : "";
			const merged =
				branch.mergedFrom.length > 0
					? ` (merged: ${branch.mergedFrom.join(", ")})`
					: "";
			lines.push(`  ${key}${parent}${merged}`);
		}
		if (this.edges.length > 0) {
			lines.push("");
			lines.push("Edges:");
			for (const edge of this.edges) {
				lines.push(`  ${edge.sourceKey} -> ${edge.targetKey} (${edge.mode})`);
			}
		}
		return lines.join("\n");
	}
}

export type {
	MergeEdge,
	SessionBranch,
	UserBehaviorProfile,
	SessionGraphData,
} from "./graph_types";
