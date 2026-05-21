import { Readable } from "stream";

export interface StreamChunk {
	type: "data" | "error" | "end";
	data?: any;
	error?: string;
	timestamp: string;
}

export class StdioToHttpsConverter {
	/**
	 * Convert stdio-based MCP communication to HTTP streaming
	 */
	static async convertToStream(
		executor: () => Promise<any>,
		onChunk?: (chunk: StreamChunk) => void,
	): Promise<ReadableStream> {
		const encoder = new TextEncoder();

		return new ReadableStream({
			async start(controller) {
				try {
					// Send initial chunk
					const startChunk: StreamChunk = {
						type: "data",
						data: { status: "started" },
						timestamp: new Date().toISOString(),
					};

					if (onChunk) onChunk(startChunk);
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(startChunk)}\n\n`),
					);

					// Execute the MCP tool
					const result = await executor();

					// Send result chunk
					const resultChunk: StreamChunk = {
						type: "data",
						data: result,
						timestamp: new Date().toISOString(),
					};

					if (onChunk) onChunk(resultChunk);
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(resultChunk)}\n\n`),
					);

					// Send end chunk
					const endChunk: StreamChunk = {
						type: "end",
						timestamp: new Date().toISOString(),
					};

					if (onChunk) onChunk(endChunk);
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(endChunk)}\n\n`),
					);

					controller.close();
				} catch (error: any) {
					// Send error chunk
					const errorChunk: StreamChunk = {
						type: "error",
						error: error.message || "Unknown error",
						timestamp: new Date().toISOString(),
					};

					if (onChunk) onChunk(errorChunk);
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`),
					);
					controller.close();
				}
			},
		});
	}

	/**
	 * Convert stdio-based MCP communication to Server-Sent Events (SSE)
	 */
	static async convertToSSE(
		executor: () => Promise<any>,
		onChunk?: (chunk: StreamChunk) => void,
	): Promise<ReadableStream> {
		return StdioToHttpsConverter.convertToStream(executor, onChunk);
	}

	/**
	 * Create a streaming response for HTTP
	 */
	static createStreamingResponse(
		stream: ReadableStream,
		headers?: Record<string, string>,
	) {
		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"X-Accel-Buffering": "no",
				...headers,
			},
		});
	}

	/**
	 * Convert a regular MCP result to a streaming format
	 */
	static async streamifyResult(result: any): Promise<ReadableStream> {
		const encoder = new TextEncoder();

		return new ReadableStream({
			start(controller) {
				// Send the result as a single chunk
				const chunk: StreamChunk = {
					type: "data",
					data: result,
					timestamp: new Date().toISOString(),
				};

				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
				);

				// Send end signal
				const endChunk: StreamChunk = {
					type: "end",
					timestamp: new Date().toISOString(),
				};

				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify(endChunk)}\n\n`),
				);
				controller.close();
			},
		});
	}

	/**
	 * Parse SSE stream on the client side
	 */
	static parseSSEStream(stream: ReadableStream): AsyncGenerator<StreamChunk> {
		return (async function* () {
			const reader = stream.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			try {
				while (true) {
					const { done, value } = await reader.read();

					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n\n");
					buffer = lines.pop() || "";

					for (const line of lines) {
						if (line.startsWith("data: ")) {
							const data = line.slice(6);
							try {
								const chunk = JSON.parse(data) as StreamChunk;
								yield chunk;
							} catch (e) {
								console.error("Failed to parse SSE chunk:", e);
							}
						}
					}
				}
			} finally {
				reader.releaseLock();
			}
		})();
	}
}
