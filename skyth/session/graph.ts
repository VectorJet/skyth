import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, safeFilename } from "@/utils/helpers";

export interface MergeEdge {
  id: string;
  sourceKey: string;
  targetKey: string;
  timestamp: number;
  mode: "full" | "compact";
  compactedMessages?: number;
}

export interface SessionBranch {
  key: string;
  createdAt: string;
  mergedFrom: string[];
  parentKey?: string;
}

export interface UserBehaviorProfile {
  switchFrequencyMs: number;
  preferredChannel: string;
  lastSwitches: Array<{
    fromChannel: string;
    toChannel: string;
    timestamp: number;
  }>;
}

export interface SessionGraphData {
  version: string;
  sessions: Record<string, SessionBranch>;
  edges: MergeEdge[];
  behavior: UserBehaviorProfile;
}

export class SessionGraph {
  private version = "1.0";
  private sessions: Map<string, SessionBranch> = new Map();
  private edges: MergeEdge[] = [];
  private behavior: UserBehaviorProfile = {
    switchFrequencyMs: 0,
    preferredChannel: "",
    lastSwitches: [],
  };
  private maxSwitchHistory = 20;
  private dirty = false;
  private workspace: string = "";

  static load(workspace: string, maxSwitchHistory = 20): SessionGraph {
    const graph = new SessionGraph();
    graph.workspace = workspace;
    graph.maxSwitchHistory = maxSwitchHistory;

    const sessionsDir = join(workspace, "sessions");
    const graphPath = join(sessionsDir, "graph.json");

    if (!existsSync(graphPath)) {
      return graph;
    }

    try {
      const data: SessionGraphData = JSON.parse(readFileSync(graphPath, "utf-8"));
      if (data.version !== "1.0") {
        console.warn("[session-graph] unknown version, starting fresh");
        return graph;
      }

      for (const [key, branch] of Object.entries(data.sessions ?? {})) {
        graph.sessions.set(key, branch);
      }
      graph.edges = data.edges ?? [];
      graph.behavior = data.behavior ?? graph.behavior;
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
      behavior: this.behavior,
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

  merge(sourceKey: string, targetKey: string, mode: "full" | "compact", compactedMessages?: number): void {
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

    for (const [sessionKey, branch] of this.sessions) {
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
    const now = Date.now();

    this.behavior.lastSwitches.push({
      fromChannel: fromChannel,
      toChannel: toChannel,
      timestamp: now,
    });

    if (this.behavior.lastSwitches.length > this.maxSwitchHistory) {
      this.behavior.lastSwitches = this.behavior.lastSwitches.slice(-this.maxSwitchHistory);
    }

    const channelCounts = new Map<string, number>();
    for (const sw of this.behavior.lastSwitches) {
      channelCounts.set(sw.toChannel, (channelCounts.get(sw.toChannel) || 0) + 1);
    }

    let maxCount = 0;
    for (const [channel, count] of channelCounts) {
      if (count > maxCount) {
        maxCount = count;
        this.behavior.preferredChannel = channel;
      }
    }

    if (this.behavior.lastSwitches.length >= 2) {
      let totalInterval = 0;
      for (let i = 1; i < this.behavior.lastSwitches.length; i++) {
        const current = this.behavior.lastSwitches[i];
        const previous = this.behavior.lastSwitches[i - 1];
        if (!current || !previous) continue;
        totalInterval += current.timestamp - previous.timestamp;
      }
      this.behavior.switchFrequencyMs = totalInterval / (this.behavior.lastSwitches.length - 1);
    }

    this.dirty = true;
  }

  shouldAutoMerge(fromKey: string, toKey: string, thresholdMs: number): boolean {
    const fromChannel = fromKey.split(":")[0];
    const toChannel = toKey.split(":")[0];

    if (fromChannel === toChannel) return false;

    const recentSwitches = this.behavior.lastSwitches.filter(
      (s) => s.timestamp > Date.now() - thresholdMs * 2
    );

    for (let i = recentSwitches.length - 1; i >= 0; i--) {
      const sw = recentSwitches[i];
      if (!sw) continue;
      if (sw.fromChannel === fromChannel && sw.toChannel === toChannel) {
        return true;
      }
    }

    return false;
  }

  getLastSwitch(): { fromChannel: string; toChannel: string; timestamp: number } | undefined {
    return this.behavior.lastSwitches[this.behavior.lastSwitches.length - 1];
  }

  getSessions(): SessionBranch[] {
    return Array.from(this.sessions.values());
  }

  getEdges(): MergeEdge[] {
    return [...this.edges];
  }

  getBehavior(): UserBehaviorProfile {
    return { ...this.behavior };
  }

  getSession(key: string): SessionBranch | undefined {
    return this.sessions.get(key);
  }

  hasMergedFrom(sourceKey: string, targetKey: string): boolean {
    return this.edges.some(
      (e) => e.sourceKey === sourceKey && e.targetKey === targetKey
    );
  }

  clear(): void {
    this.sessions.clear();
    this.edges = [];
    this.behavior = {
      switchFrequencyMs: 0,
      preferredChannel: "",
      lastSwitches: [],
    };
    this.dirty = true;
  }

  visualize(): string {
    const lines: string[] = ["Session Graph:", ""];

    const roots = Array.from(this.sessions.values()).filter(
      (b) => !b.parentKey
    );

    const visited = new Set<string>();

    const render = (branch: SessionBranch, indent: string, isLast: boolean): void => {
      if (visited.has(branch.key)) {
        lines.push(`${indent}\\- (already shown)`);
        return;
      }
      visited.add(branch.key);

      const prefix = isLast ? "`-- " : "|-- ";
      const merged = branch.mergedFrom.length > 0 ? ` (merged from: ${branch.mergedFrom.join(", ")})` : "";
      lines.push(`${indent}${prefix}${branch.key}${merged}`);

      const children = Array.from(this.sessions.values()).filter(
        (b) => b.parentKey === branch.key
      );

      const childIndent = indent + (isLast ? "    " : "|   ");
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!child) continue;
        render(child, childIndent, i === children.length - 1);
      }
    };

    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      if (!root) continue;
      render(root, "", i === roots.length - 1);
    }

    if (this.behavior.lastSwitches.length > 0) {
      lines.push("");
      lines.push("Recent switches:");
      for (const sw of this.behavior.lastSwitches.slice(-5).reverse()) {
        const date = new Date(sw.timestamp).toISOString();
        lines.push(`  ${date}: ${sw.fromChannel} -> ${sw.toChannel}`);
      }
    }

    return lines.join("\n");
  }
}
