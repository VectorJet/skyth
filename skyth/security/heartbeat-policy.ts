import type { Config } from "@/config/schema";

export interface HeartbeatPolicy {
	enabled: boolean;
	every: string;
	ackMaxChars: number;
	directPolicy: "allow" | "block";
}

export const DEFAULT_HEARTBEAT_POLICY: HeartbeatPolicy = {
	enabled: false,
	every: "30m",
	ackMaxChars: 50,
	directPolicy: "allow",
};

export function getHeartbeatPolicy(cfg: Config): HeartbeatPolicy {
	const agentsDefaults = cfg.agents?.defaults as Record<string, any>;
	const heartbeat = agentsDefaults?.heartbeat;

	if (!heartbeat) {
		return DEFAULT_HEARTBEAT_POLICY;
	}

	return {
		enabled: heartbeat.every !== "0m" && heartbeat.every !== "0",
		every: heartbeat.every ?? DEFAULT_HEARTBEAT_POLICY.every,
		ackMaxChars: heartbeat.ackMaxChars ?? DEFAULT_HEARTBEAT_POLICY.ackMaxChars,
		directPolicy:
			heartbeat.directPolicy ?? DEFAULT_HEARTBEAT_POLICY.directPolicy,
	};
}

export function isHeartbeatEmptyFile(path: string, content: string): boolean {
	const lines = content.split("\n").filter((line) => {
		const trimmed = line.trim();
		return trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("//");
	});
	return lines.length === 0;
}

export function shouldSkipHeartbeat(
	heartbeatPolicy: HeartbeatPolicy,
	heartbeatFilePath: string,
	content: string,
): boolean {
	if (!heartbeatPolicy.enabled) return true;

	if (isHeartbeatEmptyFile(heartbeatFilePath, content)) {
		return true;
	}

	return false;
}

export function suppressHeartbeatDelivery(
	heartbeatPolicy: HeartbeatPolicy,
	targetType: "dm" | "group",
	responseText: string,
): boolean {
	if (heartbeatPolicy.directPolicy === "block" && targetType === "dm") {
		return true;
	}

	const ackText = responseText.trim().toUpperCase();
	if (ackText === "HEARTBEAT_OK" || ackText.startsWith("HEARTBEAT_OK")) {
		return true;
	}

	if (
		responseText.length <= heartbeatPolicy.ackMaxChars &&
		ackText.startsWith("HEARTBEAT")
	) {
		return true;
	}

	return false;
}
