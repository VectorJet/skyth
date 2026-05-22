import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { ensureQuasarDaemon } from "@/quasar/daemon.ts";
import type {
	IpcResponse,
	RequestKind,
	ResponseKind,
} from "@/quasar/protocol.ts";

export function isConnectMissingSocket(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: string }).code === "ENOENT"
	);
}

export async function requestQuasar<T extends ResponseKind["result"]>(input: {
	actor: string;
	socketPath: string;
	timeoutMs: number;
	kind: RequestKind;
	expected: T;
}): Promise<Extract<ResponseKind, { result: T }>> {
	return requestQuasarOnce(input).catch(async (error) => {
		if (!isConnectMissingSocket(error) && existsSync(input.socketPath)) {
			throw error;
		}
		await ensureQuasarDaemon(input.socketPath);
		return await requestQuasarOnce(input);
	});
}

function requestQuasarOnce<T extends ResponseKind["result"]>(input: {
	actor: string;
	socketPath: string;
	timeoutMs: number;
	kind: RequestKind;
	expected: T;
}): Promise<Extract<ResponseKind, { result: T }>> {
	const id = crypto.randomUUID();
	const payload = JSON.stringify({
		id,
		actor: input.actor,
		kind: input.kind,
	});
	const body = Buffer.from(payload, "utf8");
	const frame = Buffer.allocUnsafe(4 + body.length);
	frame.writeUInt32BE(body.length, 0);
	body.copy(frame, 4);

	return new Promise((resolve, reject) => {
		const socket = createConnection(input.socketPath);
		const chunks: Buffer[] = [];
		let expectedBytes: number | null = null;
		const timer = setTimeout(() => {
			socket.destroy();
			reject(new Error(`quasar ipc timed out after ${input.timeoutMs}ms`));
		}, input.timeoutMs);

		socket.once("connect", () => socket.write(frame));
		socket.on("data", (chunk: Buffer) => {
			chunks.push(chunk);
			const data = Buffer.concat(chunks);
			if (expectedBytes === null && data.length >= 4) {
				expectedBytes = data.readUInt32BE(0);
			}
			if (expectedBytes === null || data.length < 4 + expectedBytes) return;
			clearTimeout(timer);
			socket.end();
			try {
				const response = JSON.parse(
					data.subarray(4, 4 + expectedBytes).toString("utf8"),
				) as IpcResponse;
				if (response.id !== id) {
					throw new Error(`quasar ipc response id mismatch: ${response.id}`);
				}
				if (response.kind.result === "error") {
					throw new Error(response.kind.message);
				}
				if (response.kind.result !== input.expected) {
					throw new Error(
						`unexpected quasar ipc result ${response.kind.result}; expected ${input.expected}`,
					);
				}
				resolve(response.kind as Extract<ResponseKind, { result: T }>);
			} catch (err) {
				reject(err);
			}
		});
		socket.once("error", (err: Error) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}
