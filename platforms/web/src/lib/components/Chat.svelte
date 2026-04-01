<script lang="ts">
import { onMount } from "svelte";
import { goto } from "$app/navigation";
import { globalState } from "$lib/state.svelte";
import ChatView from "./ChatView.svelte";

interface ToolCall {
	id: string;
	name: string;
	args: string;
	result?: any;
	state: "running" | "completed" | "error";
}

interface Message {
	id: string;
	sender: string;
	content: string;
	reasoning?: string;
	toolCalls?: ToolCall[];
	timestamp: string;
	isOwn: boolean;
}

// State
let messages = $state<Message[]>([]);
let ws = $state<WebSocket | null>(null);
let isLoading = $state(false);
let streamingMessage = $state<Message | null>(null);
let streamingContent = "";
let streamingReasoning = "";
let streamingToolCalls = $state<ToolCall[]>([]);
let pingInterval: ReturnType<typeof setInterval> | null = null;

const GATEWAY_URL =
	typeof window !== "undefined"
		? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
		: "";
const API_BASE =
	typeof window !== "undefined" ? `${window.location.origin}` : "";

onMount(() => {
	if (globalState.token) {
		connectWebSocket();
	} else {
		goto("/auth");
	}
});

function fetchSessionHistory(sessionKey: string, retries = 0) {
	const maxRetries = 10;
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		if (retries < maxRetries) {
			setTimeout(() => fetchSessionHistory(sessionKey, retries + 1), 100);
		}
		return;
	}

	ws.send(
		JSON.stringify({
			type: "request",
			id: `history-${Date.now()}`,
			method: "sessions.history",
			params: { sessionKey, maxMessages: 100 },
		}),
	);
}

function connectWebSocket() {
	if (!globalState.token) return;
	globalState.setStatus("connecting");
	ws = new WebSocket(GATEWAY_URL);

	ws.onopen = () => {
		globalState.setStatus("connected");
		// Authenticate the WS connection
		ws?.send(
			JSON.stringify({
				type: "request",
				id: "auth-1",
				method: "connect.auth",
				params: { token: globalState.token },
			}),
		);

		// Fetch session history after auth
		// Session key format is channel:chatId, so for web channel with chatId web:username, it's web:web:username
		const chatId = globalState.username ? `web:${globalState.username}` : "web:anonymous";
		const sessionKey = `web:${chatId}`; // web:web:username format
		fetchSessionHistory(sessionKey);

		pingInterval = setInterval(() => {
			if (!ws || ws.readyState !== WebSocket.OPEN) return;
			ws.send(
				JSON.stringify({
					type: "request",
					id: `ping-${Date.now()}`,
					method: "event.ping",
				}),
			);
		}, 30_000);
	};

	ws.onmessage = (event) => {
		const data = JSON.parse(event.data);

		// Handle session history response
		if (data.type === "response" && data.id?.startsWith("history-")) {
			if (data.result?.messages && Array.isArray(data.result.messages)) {
				messages = data.result.messages.map((msg: any) => ({
					id: msg.id || crypto.randomUUID(),
					sender: msg.role === "user" ? globalState.username : "Skyth",
					content: msg.content || "",
					reasoning: msg.reasoning,
					toolCalls: msg.tool_calls?.map((tc: any) => ({
						id: tc.id,
						name: tc.name,
						args: JSON.stringify(tc.arguments, null, 2),
						state: "completed",
					})),
					timestamp: msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
					isOwn: msg.role === "user",
				}));
			}
			return;
		}

		if (data.type === "event" && data.event === "chat.stream") {
			const payload = data.payload;
			// Backend sends text inside message.content[0].text
			const deltaText = payload.message?.content?.[0]?.text ?? payload.text ?? "";
			if (payload.type === "text-delta" && deltaText) {
				// Backend sends accumulated text, not incremental deltas
				streamingContent = deltaText;
				if (!streamingMessage) {
					streamingReasoning = "";
					streamingMessage = {
						id: crypto.randomUUID(),
						sender: "Skyth",
						content: streamingContent,
						toolCalls: streamingToolCalls,
						timestamp: new Date().toLocaleTimeString(),
						isOwn: false,
					};
					isLoading = false;
				} else {
					streamingMessage = { ...streamingMessage, content: streamingContent };
				}
			} else if (payload.type === "tool-call") {
				const index = streamingToolCalls.findIndex(
					(tc) => tc.id === payload.toolCallId,
				);
				if (index >= 0) {
					streamingToolCalls[index].args = payload.args;
				} else {
					streamingToolCalls = [
						...streamingToolCalls,
						{
							id: payload.toolCallId,
							name: payload.toolName,
							args: payload.args,
							state: "running",
						},
					];
				}
				if (!streamingMessage) {
					streamingMessage = {
						id: crypto.randomUUID(),
						sender: "Skyth",
						content: streamingContent,
						toolCalls: streamingToolCalls,
						timestamp: new Date().toLocaleTimeString(),
						isOwn: false,
					};
					isLoading = false;
				} else {
					streamingMessage = {
						...streamingMessage,
						toolCalls: streamingToolCalls,
					};
				}
			} else if (payload.type === "tool-result") {
				const index = streamingToolCalls.findIndex(
					(tc) => tc.id === payload.toolCallId,
				);
				if (index >= 0) {
					streamingToolCalls[index].state = "completed";
					streamingToolCalls[index].result = payload.result;
					if (streamingMessage) {
						streamingMessage = {
							...streamingMessage,
							toolCalls: streamingToolCalls,
						};
					}
				}
			} else if (payload.type === "reasoning-delta" && deltaText) {
				// Backend sends accumulated reasoning, not incremental deltas
				streamingReasoning = deltaText;
				if (!streamingMessage) {
					streamingContent = "";
					streamingMessage = {
						id: crypto.randomUUID(),
						sender: "Skyth",
						content: "",
						reasoning: streamingReasoning,
						toolCalls: streamingToolCalls,
						timestamp: new Date().toLocaleTimeString(),
						isOwn: false,
					};
					isLoading = false;
				} else {
					streamingMessage = {
						...streamingMessage,
						reasoning: streamingReasoning,
					};
				}
			}
		}

		// chat.final: finalize streamed assistant message with full text
		if (data.type === "event" && data.event === "chat.final") {
			const payload = data.payload;
			const finalText = payload.message?.content?.[0]?.text ?? payload.content ?? streamingContent;
			const finalMsg: Message = {
				id: crypto.randomUUID(),
				sender: "Skyth",
				content: finalText,
				reasoning: streamingReasoning || undefined,
				toolCalls: streamingToolCalls.length > 0 ? [...streamingToolCalls] : undefined,
				timestamp: new Date().toLocaleTimeString(),
				isOwn: false,
			};
			messages = [...messages, finalMsg];
			streamingMessage = null;
			streamingContent = "";
			streamingReasoning = "";
			streamingToolCalls = [];
			isLoading = false;
		}

		// chat.message: also finalizes (sent via bus.publishOutbound -> webChannel.send)
		if (data.type === "event" && data.event === "chat.message") {
			const payload = data.payload;
			// If chat.final already handled this, skip duplicate
			if (streamingMessage === null && streamingContent === "") return;
			streamingMessage = null;
			streamingContent = "";
			streamingReasoning = "";
			streamingToolCalls = [];
			messages = [
				...messages,
				{
					id: crypto.randomUUID(),
					sender: "Skyth",
					content: payload.content,
					reasoning: payload.metadata?.reasoning,
					toolCalls: payload.metadata?.tool_calls?.map((tc: any) => ({
						id: tc.id,
						name: tc.name,
						args: JSON.stringify(tc.arguments, null, 2),
						state: "completed",
					})),
					timestamp: new Date(payload.timestamp).toLocaleTimeString(),
					isOwn: false,
				},
			];
			isLoading = false;
		}
	};

	ws.onclose = () => {
		if (pingInterval) {
			clearInterval(pingInterval);
			pingInterval = null;
		}
		globalState.setStatus("disconnected");
		if (globalState.token) {
			setTimeout(connectWebSocket, 3000);
		}
	};
}

async function sendMessage(content: string) {
	if (!globalState.token) return;

	// Optimistic UI
	// 🛡️ Sentinel: Use crypto.randomUUID() instead of Math.random() for secure unique IDs
	messages = [
		...messages,
		{
			id: crypto.randomUUID(),
			sender: globalState.username,
			content,
			timestamp: new Date().toLocaleTimeString(),
			isOwn: true,
		},
	];

	isLoading = true;

	try {
		const res = await fetch(`${API_BASE}/api/chat`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: globalState.token,
			},
			body: JSON.stringify({
				content,
				senderId: globalState.username,
				// chatId is used to derive session key as channel:chatId = web:chatId
				chatId: globalState.username ? `web:${globalState.username}` : "web:anonymous",
			}),
		});
		const data = await res.json();
		if (data.error === "Unauthorized") {
			globalState.setToken(null);
			goto("/auth");
		}
	} catch (e) {
		// noop
	}
}
</script>

<ChatView 
  {messages} 
  {streamingMessage}
  {isLoading}
  status={globalState.status} 
  onSendMessage={sendMessage} 
/>
