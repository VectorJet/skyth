/**
 * Per-channel token-bucket rate limiter.
 *
 *   - Keyed by `(channel, chatId)` so noisy chats can't starve quiet ones.
 *   - Each bucket holds up to `capacity` tokens and refills at `refillPerSec`.
 *   - `acquire()` waits (yielding the event loop) until a token is available.
 *   - Channel-level defaults follow upstream limits:
 *       Telegram: ~1 message/sec/chat (Bot API soft limit).
 *       Web:      lenient, ~5 msg/sec/tab.
 *
 * The MessageRouter calls into this *only* on the outbound path
 * (ChannelManager.send / sendFile) — never on the inbound path so user
 * messages always reach the queue.
 */
const DEFAULTS: Record<string, { capacity: number; refillPerSec: number }> = {
	telegram: { capacity: 5, refillPerSec: 1 },
	web: { capacity: 10, refillPerSec: 5 },
	default: { capacity: 5, refillPerSec: 2 },
};

interface Bucket {
	tokens: number;
	capacity: number;
	refillPerSec: number;
	lastRefill: number;
}

export class RateLimiter {
	private buckets = new Map<string, Bucket>();

	private bucketFor(channel: string, chatId: string): Bucket {
		const key = `${channel}:${chatId}`;
		let b = this.buckets.get(key);
		if (!b) {
			const cfg = DEFAULTS[channel] ?? DEFAULTS.default!;
			b = {
				tokens: cfg.capacity,
				capacity: cfg.capacity,
				refillPerSec: cfg.refillPerSec,
				lastRefill: Date.now(),
			};
			this.buckets.set(key, b);
		}
		return b;
	}

	private refill(b: Bucket) {
		const now = Date.now();
		const elapsedSec = (now - b.lastRefill) / 1000;
		if (elapsedSec <= 0) return;
		b.tokens = Math.min(b.capacity, b.tokens + elapsedSec * b.refillPerSec);
		b.lastRefill = now;
	}

	/** Wait (max ~5s steps) until a token is available, then consume one. */
	async acquire(channel: string, chatId: string): Promise<void> {
		const b = this.bucketFor(channel, chatId);
		while (true) {
			this.refill(b);
			if (b.tokens >= 1) {
				b.tokens -= 1;
				return;
			}
			const waitMs = Math.max(50, ((1 - b.tokens) / b.refillPerSec) * 1000);
			await new Promise((r) => setTimeout(r, Math.min(5000, waitMs)));
		}
	}

	/** Force a delay before the next acquire — used to honor Telegram retry_after. */
	penalize(channel: string, chatId: string, retryAfterSec: number) {
		const b = this.bucketFor(channel, chatId);
		b.tokens = -Math.max(0, retryAfterSec) * b.refillPerSec;
		b.lastRefill = Date.now();
	}

	stats() {
		const out: Record<string, { tokens: number; capacity: number }> = {};
		for (const [k, b] of this.buckets) {
			this.refill(b);
			out[k] = { tokens: Math.floor(b.tokens), capacity: b.capacity };
		}
		return out;
	}
}

/** Singleton — channels share one limiter so stats and back-pressure align. */
export const rateLimiter = new RateLimiter();
