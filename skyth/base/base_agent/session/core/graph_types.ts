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
