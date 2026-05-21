export class SSEManager {
	private clients = new Set<ReadableStreamDefaultController>();

	addClient(controller: ReadableStreamDefaultController) {
		this.clients.add(controller);
	}

	removeClient(controller: ReadableStreamDefaultController) {
		this.clients.delete(controller);
	}

	getClientCount(): number {
		return this.clients.size;
	}

	notifyToolsListChanged() {
		console.log(
			"[MCP] Emitting notifications/tools/list_changed to",
			this.clients.size,
			"clients",
		);
		const notification = {
			jsonrpc: "2.0",
			method: "notifications/tools/list_changed",
		};
		const data = `event: message\ndata: ${JSON.stringify(notification)}\n\n`;
		for (const client of this.clients) {
			try {
				client.enqueue(new TextEncoder().encode(data));
			} catch (e) {
				console.error("[MCP] Failed to send list_changed notification", e);
			}
		}
	}
}
