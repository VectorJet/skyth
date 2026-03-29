import {
	sessionKey,
	type InboundMessage,
	type OutboundMessage,
} from "@/bus/events";
import type { StreamCallback } from "@/providers/base";
import { completeBootstrapIfReady } from "@/base/base_agent/onboarding/bootstrap";
import { runAgentLoop } from "@/base/base_agent/runtime/agent_loop_runner";
import { sanitizeOutput } from "@/base/base_agent/runtime/policies";
import { consumePendingMergeIfRequested } from "@/base/base_agent/session/cross_channel";
import { runSwitchMerge } from "@/base/base_agent/session/merge";
import { handleRuntimeCommand } from "@/base/base_agent/runtime/commands";
import { scheduleConsolidationIfNeeded } from "@/base/base_agent/runtime/memory_scheduler";
import type { RuntimeContext } from "@/base/base_agent/runtime/types";
import { recordMentalImage } from "@/base/base_agent/memory/mental_image";
import {
	createTurnTracker,
	type ToolExecutionContext,
} from "@/base/base_agent/tools/context";

export async function processMessageWithRuntime(
	runtime: RuntimeContext,
	msg: InboundMessage,
	overrideSessionKey?: string,
	onStream?: StreamCallback,
): Promise<OutboundMessage | null> {
	await runtime.toolsReady;

	if (msg.channel === "system") {
		const [channel, chatId] = msg.chatId.includes(":")
			? msg.chatId.split(":", 2)
			: ["cli", msg.chatId ?? ""];
		const key = `${channel ?? "cli"}:${chatId ?? ""}`;
		return await processMessageWithRuntime(
			runtime,
			{ ...msg, channel: channel ?? "cli", chatId: chatId ?? "" },
			key,
			onStream,
		);
	}

	const key = overrideSessionKey ?? sessionKey(msg);
	const session = runtime.sessions.getOrCreate(key);
	runtime.setToolContext(
		msg.channel,
		msg.chatId,
		String(msg.metadata?.message_id ?? "") || undefined,
	);
	const outboundHandoff = runtime.takeOutboundHandoff(key);

	const mergeState = await runSwitchMerge({
		runtime,
		msg,
		key,
		session,
		outboundHandoff,
	});
	const previousChannel = mergeState.previousChannel;
	const previousChatId = mergeState.previousChatId;
	const platformChanged = mergeState.platformChanged;

	consumePendingMergeIfRequested({
		session,
		targetKey: key,
		currentMessage: msg.content,
		sessions: runtime.sessions,
		stickyBridge: runtime.stickyBridge,
		onLog: (line) => console.log(line),
	});

	runtime.lastGlobalChannel = msg.channel;
	runtime.lastGlobalChatId = msg.chatId;

	recordMentalImage(runtime.memory, msg);

	const turnTracker = createTurnTracker();

	const cmd = msg.content.trim().toLowerCase();
	const commandResult = await handleRuntimeCommand({
		runtime,
		msg,
		cmd,
		session,
	});
	if (commandResult.handled) return commandResult.response;

	completeBootstrapIfReady(runtime.workspace, () =>
		runtime.emit("event", "agent", "status", "bootstrap rm"),
	);
	scheduleConsolidationIfNeeded(runtime, session);

	const initialMessages = runtime.context.buildMessages({
		history: session.getHistory(runtime.memoryWindow),
		currentMessage: msg.content,
		channel: msg.channel,
		chat_id: msg.chatId,
		media: msg.media,
		toolNames: runtime.tools.toolNames,
		userLocation: String(msg.metadata?.ip_location ?? ""),
		sessionPrimer:
			session.messages.length === 0
				? runtime.memory.getSessionPrimer(key, 10)
				: "",
		platformChanged,
		previousChannel: previousChannel || undefined,
		previousChatId: previousChatId || undefined,
		enabledChannels: runtime.enabledChannels,
		channelTargets: runtime.channelTargets,
	});

	const toolContext: ToolExecutionContext = {
		workspace: runtime.workspace,
		bus: runtime.bus,
		sessions: runtime.sessions,
		subagents: runtime.subagents,
		memory: runtime.memory,
		cron: runtime.cron,
		channel: msg.channel,
		chatId: msg.chatId,
		messageId: String(msg.metadata?.message_id ?? "") || undefined,
		sessionKey: key,
		turnTracker,
	};
	let finalContent: string | null = null;
	let toolsUsed: string[] = [];
	let finalReasoning: string | null = null;
	try {
		[finalContent, toolsUsed, finalReasoning] = await runAgentLoop({
			initialMessages,
			key,
			onStream,
			maxIterations: runtime.maxIterations,
			steps: runtime.steps,
			provider: runtime.provider,
			tools: runtime.tools,
			toolContext,
			context: runtime.context,
			model: runtime.model,
			temperature: runtime.temperature,
			maxTokens: runtime.maxTokens,
			emit: runtime.emit.bind(runtime),
			workspace: runtime.workspace,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		runtime.emit(
			"event",
			"agent",
			"warn",
			`loop recovered from runtime error: ${message}`,
			undefined,
			key,
		);
		finalContent =
			"I recovered from an internal runtime issue and preserved this session state. I will continue handling the task.";
		toolsUsed = [];
		finalReasoning = null;
	}
	completeBootstrapIfReady(runtime.workspace, () =>
		runtime.emit("event", "agent", "status", "bootstrap rm"),
	);
	const raw =
		finalContent ??
		"I lost the thread for a moment. Say that again and I'll respond directly.";
	const { content, replyToCurrent } = sanitizeOutput(raw);

	session.addMessage("user", msg.content);
	session.addMessage("assistant", content, {
		tools_used: toolsUsed.length ? toolsUsed : undefined,
		reasoning: finalReasoning ?? undefined,
	});
	session.metadata.last_channel = msg.channel;
	session.metadata.last_chat_id = msg.chatId;
	runtime.sessions.save(session);

	if (turnTracker.sendRecords.length) {
		runtime.noteOutboundHandoff(turnTracker.sendRecords);
	}

	if (turnTracker.sentInTurn) {
		return null;
	}

	const replyTo = replyToCurrent
		? String(msg.metadata?.message_id ?? "") || undefined
		: undefined;

	return {
		channel: msg.channel,
		chatId: msg.chatId,
		content,
		replyTo,
		metadata: { ...msg.metadata, reasoning: finalReasoning ?? undefined },
	};
}
