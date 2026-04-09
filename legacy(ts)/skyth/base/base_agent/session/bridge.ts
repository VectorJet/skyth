export class StickyBridgeController {
	private pair = "";
	private remaining = 0;
	private expiresAt = 0;

	constructor(
		private readonly maxSwitches: number,
		private readonly ttlMs: number,
	) {}

	activate(sourceKey: string, targetKey: string): void {
		if (this.maxSwitches <= 0) return;
		this.pair = this.pairKey(sourceKey, targetKey);
		this.remaining = this.maxSwitches;
		this.expiresAt = Date.now() + this.ttlMs;
	}

	consumeIfActive(
		sourceKey: string,
		targetKey: string,
		currentMessage: string,
	): boolean {
		if (!this.pair) return false;
		if (this.isTopicResetMessage(currentMessage)) {
			this.clear();
			return false;
		}
		if (this.remaining <= 0 || this.expiresAt <= Date.now()) {
			this.clear();
			return false;
		}
		if (this.pair !== this.pairKey(sourceKey, targetKey)) return false;

		this.remaining -= 1;
		if (this.remaining <= 0) {
			this.clear();
		}
		return true;
	}

	clear(): void {
		this.pair = "";
		this.remaining = 0;
		this.expiresAt = 0;
	}

	private pairKey(a: string, b: string): string {
		return [a, b].sort().join("<->");
	}

	private isTopicResetMessage(message: string): boolean {
		const normalized = message.trim().toLowerCase();
		if (normalized === "/new") return true;
		return /\b(start (a )?(new|fresh) (topic|chat|conversation)|new topic|different topic|start over|from scratch)\b/i.test(
			message,
		);
	}
}
