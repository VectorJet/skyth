import net from "node:net";
import { createInterface } from "node:readline";
import type { QuasarRequest, QuasarResponse } from "./types.js";

export class QuasarClient {
	private socket: net.Socket;
	private pending = new Map<
		string,
		{ resolve: (v: unknown) => void; reject: (e: Error) => void }
	>();
	private subs = new Map<string, Set<(payload: unknown) => void>>();
	private rl: readline.Interface;
	private closed = false;

	constructor(socketPath = "/tmp/quasard.sock") {
		this.socket = net.createConnection(socketPath);

		this.socket.on("error", (err) => {
			for (const [, p] of this.pending) {
				p.reject(err);
			}
			this.pending.clear();
		});

		this.socket.on("close", () => {
			this.closed = true;
			for (const [, p] of this.pending) {
				p.reject(new Error("connection closed"));
			}
			this.pending.clear();
		});

		this.rl = createInterface({ input: this.socket });

		this.rl.on("line", (line: string) => {
			try {
				const msg = JSON.parse(line) as QuasarResponse;

				if (msg.type === "event") {
					this.subs.get(msg.topic)?.forEach((fn) => fn(msg.payload));
					return;
				}

				const p = this.pending.get(msg.id);
				if (!p) return;

				this.pending.delete(msg.id);

				if (msg.type === "error") {
					p.reject(new Error(msg.error));
				} else {
					p.resolve(msg.result);
				}
			} catch {
				// Ignore parse errors
			}
		});
	}

	private send<T>(req: Omit<QuasarRequest, "id">): Promise<T> {
		if (this.closed) {
			return Promise.reject(new Error("connection closed"));
		}

		const id = crypto.randomUUID();

		return new Promise<T>((resolve, reject) => {
			this.pending.set(id, {
				resolve: resolve as (v: unknown) => void,
				reject,
			});
			this.socket.write(JSON.stringify({ id, ...req }) + "\n");
		});
	}

	async read(path: string): Promise<string> {
		return this.send<string>({ op: "read", path });
	}

	async write(path: string, data: string): Promise<void> {
		return this.send<void>({ op: "write", path, data });
	}

	async mkdir(path: string): Promise<void> {
		return this.send<void>({ op: "mkdir", path });
	}

	async ls(path: string): Promise<string[]> {
		return this.send<string[]>({ op: "ls", path });
	}

	async subscribe(
		pattern: string,
		fn: (payload: unknown) => void,
	): Promise<void> {
		if (!this.subs.has(pattern)) {
			this.subs.set(pattern, new Set());
		}
		this.subs.get(pattern)!.add(fn);
		return this.send<void>({ op: "subscribe", pattern });
	}

	async publish(topic: string, payload: unknown): Promise<void> {
		return this.send<void>({ op: "publish", topic, payload });
	}

	async ping(): Promise<string> {
		return this.send<string>({ op: "ping" });
	}

	close(): void {
		this.socket.destroy();
		this.closed = true;
	}
}
