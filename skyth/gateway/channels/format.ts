/**
 * Wraps a body so the agent reliably recognizes it as a gateway-originated
 * message. The first line is always `[GATEWAY]` followed by the body.
 */
export function wrapGatewayMessage(body: string): string {
	return `[GATEWAY]\n${body.trim()}`;
}

/** Strip the `[GATEWAY]` prefix when rendering to humans. */
export function stripGatewayPrefix(text: string): string {
	if (text.startsWith("[GATEWAY]\n")) return text.slice("[GATEWAY]\n".length);
	if (text.startsWith("[GATEWAY] ")) return text.slice("[GATEWAY] ".length);
	return text;
}

/** Build the per-channel behavior hint block. */
export function buildChannelBehaviorHint(meta: {
	channel: string;
	capabilities: {
		reactions: boolean;
		files: boolean;
		markdown: string;
		maxTextBytes: number;
	};
}): string {
	const c = meta.capabilities;
	const lines = [
		`channel=${meta.channel}`,
		`capabilities: reactions=${c.reactions}, files=${c.files}, markdown=${c.markdown}, max_text_bytes=${c.maxTextBytes}`,
		"behavior:",
	];

	if (meta.channel === "telegram") {
		lines.push(
			`  - Replies must be <${c.maxTextBytes} bytes; send multiple messages if needed.`,
			"  - Use Markdown v2 escapes. Avoid raw `_`, `*`, `[`, `]` unless escaped.",
			"  - Prefer concise answers; this is a chat, not a doc.",
			"  - You may react with an emoji using channel_react before answering.",
			"  - When ambiguous about which tool to use, call find_tools first.",
		);
	} else if (meta.channel === "web") {
		lines.push(
			"  - Full Markdown is OK. Long answers are fine.",
			"  - Use the workspace via the filesystem MCP for any persistent state.",
			"  - When ambiguous about which tool to use, call find_tools first.",
		);
	} else {
		lines.push(
			"  - When ambiguous about which tool to use, call find_tools first.",
		);
	}

	return lines.join("\n");
}
