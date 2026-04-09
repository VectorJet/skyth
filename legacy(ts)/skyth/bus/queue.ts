import type { InboundMessage, OutboundMessage } from "@/bus/events";

class AsyncQueue<T> {
	private items: T[] = [];
	private waiters: Array<{ id: number; resolve: (item: T) => void }> = [];
	private waiterId = 0;

	push(item: T): void {
		const waiter = this.waiters.shift();
		if (waiter) waiter.resolve(item);
		else this.items.push(item);
	}

	async shift(): Promise<T> {
		const item = this.items.shift();
		if (item !== undefined) return item;
		return await new Promise<T>((resolve) => {
			this.waiters.push({ id: ++this.waiterId, resolve });
		});
	}

	async shiftWithTimeout(timeoutMs: number): Promise<T | null> {
		const item = this.items.shift();
		if (item !== undefined) return item;
		return await new Promise<T | null>((resolve) => {
			const id = ++this.waiterId;
			this.waiters.push({
				id,
				resolve: (value) => resolve(value),
			});
			const timer = setTimeout(() => {
				const idx = this.waiters.findIndex((w) => w.id === id);
				if (idx >= 0) this.waiters.splice(idx, 1);
				resolve(null);
			}, timeoutMs);
			timer.unref?.();
		});
	}

	get size(): number {
		return this.items.length;
	}
}

export class MessageBus {
	private readonly inbound = new AsyncQueue<InboundMessage>();
	private readonly outbound = new AsyncQueue<OutboundMessage>();

	async publishInbound(msg: InboundMessage): Promise<void> {
		this.inbound.push(msg);
	}

	async consumeInbound(): Promise<InboundMessage> {
		return this.inbound.shift();
	}

	async consumeInboundWithTimeout(
		timeoutMs: number,
	): Promise<InboundMessage | null> {
		return this.inbound.shiftWithTimeout(timeoutMs);
	}

	async publishOutbound(msg: OutboundMessage): Promise<void> {
		this.outbound.push(msg);
	}

	async consumeOutbound(): Promise<OutboundMessage> {
		return this.outbound.shift();
	}

	async consumeOutboundWithTimeout(
		timeoutMs: number,
	): Promise<OutboundMessage | null> {
		return this.outbound.shiftWithTimeout(timeoutMs);
	}

	get inboundSize(): number {
		return this.inbound.size;
	}

	get outboundSize(): number {
		return this.outbound.size;
	}
}
