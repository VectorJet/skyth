import type { UserBehaviorProfile } from "./graph_types";

export class BehaviorTracker {
	private behavior: UserBehaviorProfile;
	private maxSwitchHistory: number;

	constructor(maxSwitchHistory = 20) {
		this.behavior = {
			switchFrequencyMs: 0,
			preferredChannel: "",
			lastSwitches: [],
		};
		this.maxSwitchHistory = maxSwitchHistory;
	}

	recordSwitch(fromChannel: string, toChannel: string): void {
		const now = Date.now();

		this.behavior.lastSwitches.push({
			fromChannel: fromChannel,
			toChannel: toChannel,
			timestamp: now,
		});

		if (this.behavior.lastSwitches.length > this.maxSwitchHistory) {
			this.behavior.lastSwitches = this.behavior.lastSwitches.slice(
				-this.maxSwitchHistory,
			);
		}

		const channelCounts = new Map<string, number>();
		for (const sw of this.behavior.lastSwitches) {
			channelCounts.set(
				sw.toChannel,
				(channelCounts.get(sw.toChannel) || 0) + 1,
			);
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
			this.behavior.switchFrequencyMs =
				totalInterval / (this.behavior.lastSwitches.length - 1);
		}
	}

	shouldAutoMerge(
		fromKey: string,
		toKey: string,
		thresholdMs: number,
	): boolean {
		const fromChannel = fromKey.split(":")[0];
		const toChannel = toKey.split(":")[0];

		if (fromChannel === toChannel) return false;

		const recentSwitches = this.behavior.lastSwitches.filter(
			(s) => s.timestamp > Date.now() - thresholdMs * 2,
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

	getLastSwitch():
		| { fromChannel: string; toChannel: string; timestamp: number }
		| undefined {
		return this.behavior.lastSwitches[this.behavior.lastSwitches.length - 1];
	}

	getPreferredChannel(): string {
		return this.behavior.preferredChannel;
	}

	getSwitchFrequencyMs(): number {
		return this.behavior.switchFrequencyMs;
	}

	getLastSwitches(): Array<{
		fromChannel: string;
		toChannel: string;
		timestamp: number;
	}> {
		return [...this.behavior.lastSwitches];
	}

	getBehavior(): UserBehaviorProfile {
		return { ...this.behavior };
	}

	setBehavior(behavior: UserBehaviorProfile): void {
		this.behavior = { ...behavior };
	}
}
