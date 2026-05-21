import { watch } from "fs";
import type {
	CapabilityKind,
	LoadSource,
} from "@/gateway/core/contracts/index.ts";

/** Coordinates source watches and debounced reload events for runtime artifacts. */
export type WatchEvent =
	| {
			type: "source.changed";
			kind: CapabilityKind;
			source: LoadSource;
			path: string;
	  }
	| {
			type: "reload.requested";
			kind: CapabilityKind;
			name?: string;
			source?: LoadSource;
	  }
	| {
			type: "reload.completed";
			kind: CapabilityKind;
			name: string;
			result?: unknown;
	  }
	| {
			type: "reload.failed";
			kind: CapabilityKind;
			name: string;
			error: string;
	  };

export interface WatcherStatus {
	watchedSources: LoadSource[];
	subscriberCount: number;
	activeWatchCount: number;
}

type WatchListener = (event: WatchEvent) => void;

export class WatcherManager {
	private sources: LoadSource[] = [];
	private listeners = new Set<WatchListener>();
	private active = new Map<string, ReturnType<typeof watch>>();
	private debounceTimers = new Map<string, Timer>();

	constructor(
		private options: { debounceMs?: number; watchBuiltin?: boolean } = {},
	) {}

	watch(source: LoadSource): void {
		if (!this.sources.includes(source)) this.sources.push(source);
	}

	unwatch(source: LoadSource): void {
		this.sources = this.sources.filter((s) => s !== source);
		const watcher = this.active.get(source.root);
		if (watcher) {
			watcher.close();
			this.active.delete(source.root);
		}
	}

	start(): void {
		for (const source of this.sources) {
			if (
				source.kind === "builtin" &&
				!this.options.watchBuiltin &&
				process.env.NODE_ENV === "production"
			)
				continue;
			if (this.active.has(source.root)) continue;
			try {
				const watcher = watch(
					source.root,
					{ recursive: true },
					(_eventType, filename) => {
						if (!filename) return;
						const changedPath = String(filename);
						const kind = source.capabilities[0];
						if (!kind) return;
						this.emit({
							type: "source.changed",
							kind,
							source,
							path: changedPath,
						});
						this.debounceReload(kind, source, changedPath);
					},
				);
				this.active.set(source.root, watcher);
			} catch (error: any) {
				console.warn(
					`[watchers] failed to watch ${source.root}: ${error?.message || error}`,
				);
			}
		}
	}

	stop(): void {
		for (const watcher of this.active.values()) watcher.close();
		this.active.clear();
		for (const timer of this.debounceTimers.values()) clearTimeout(timer);
		this.debounceTimers.clear();
	}

	subscribe(listener: WatchListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Dispatch a watcher event to all subscribers. */
	emit(event: WatchEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error: any) {
				console.warn(`[watchers] subscriber threw: ${error?.message || error}`);
			}
		}
	}

	status(): WatcherStatus {
		return {
			watchedSources: [...this.sources],
			subscriberCount: this.listeners.size,
			activeWatchCount: this.active.size,
		};
	}

	private debounceReload(
		kind: CapabilityKind,
		source: LoadSource,
		changedPath: string,
	): void {
		const name = changedPath.split(/[\\/]/)[0] || undefined;
		const key = `${source.root}:${kind}:${name || "*"}`;
		const existing = this.debounceTimers.get(key);
		if (existing) clearTimeout(existing);
		const timer = setTimeout(
			() => {
				this.debounceTimers.delete(key);
				this.emit({ type: "reload.requested", kind, source, name });
			},
			Math.max(0, this.options.debounceMs ?? 250),
		);
		this.debounceTimers.set(key, timer);
	}
}
