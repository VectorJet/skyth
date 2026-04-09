import type { Session } from "@/session/manager";
import { isExplicitCrossChannelRequest } from "@/session/router";
import type {
	RuntimeContext,
	RuntimeInbound,
} from "@/base/base_agent/runtime/types";
import {
	buildCompactionPrompt,
	buildCrossChannelMessages,
} from "@/base/base_agent/session/cross_channel";

export async function handlePlatformSwitchMerge(params: {
	runtime: RuntimeContext;
	msg: RuntimeInbound;
	key: string;
	session: Session;
	outboundHandoff?: {
		sourceKey: string;
		sourceChannel: string;
		sourceChatId: string;
	};
}): Promise<{
	previousChannel?: string;
	previousChatId?: string;
	platformChanged: boolean;
}> {
	const { runtime, msg, key, session, outboundHandoff } = params;

	const statePreviousChannel = runtime.lastGlobalChannel;
	const statePreviousChatId = runtime.lastGlobalChatId;
	const previousChannel =
		outboundHandoff?.sourceChannel ?? statePreviousChannel;
	const previousChatId = outboundHandoff?.sourceChatId ?? statePreviousChatId;
	const platformChanged = outboundHandoff
		? true
		: Boolean(statePreviousChannel && statePreviousChatId) &&
			(statePreviousChannel !== msg.channel ||
				statePreviousChatId !== msg.chatId);

	if (
		!(
			platformChanged &&
			previousChannel &&
			previousChatId &&
			runtime.autoMergeOnSwitch
		)
	) {
		return { previousChannel, previousChatId, platformChanged };
	}

	const previousKey =
		outboundHandoff?.sourceKey ?? `${previousChannel}:${previousChatId}`;
	const previousSession = runtime.sessions.getOrCreate(previousKey);

	if (previousSession.messages.length > 0) {
		const routerResult = outboundHandoff
			? {
					decision: "continue" as const,
					confidence: 0.99,
					reason: "Agent cross-channel handoff",
				}
			: runtime.stickyBridge.consumeIfActive(previousKey, key, msg.content)
				? {
						decision: "continue" as const,
						confidence: 0.99,
						reason: "Sticky bridge continuation",
					}
				: await runtime.mergeRouter.classify(
						previousSession.messages,
						session.messages,
						msg.content,
					);
		console.log(
			`[session-graph] router: ${routerResult.decision} (${routerResult.reason})`,
		);

		if (routerResult.decision === "continue") {
			const mergeCheck = outboundHandoff
				? runtime.sessions.shouldMerge(
						previousKey,
						key,
						previousSession,
						session,
						0,
						0,
					)
				: runtime.sessions.shouldMerge(
						previousKey,
						key,
						previousSession,
						session,
						0,
					);

			if (mergeCheck.shouldMerge) {
				const compactionCheck = runtime.sessions.needsCompaction(session, 80);

				if (compactionCheck.needsCompaction) {
					console.log(
						`[session-graph] target at ${Math.round(compactionCheck.percentUsed)}% - compacting before merge`,
					);
					const compactResult = await runtime.sessions.compactSession(
						session,
						async (msgs: any[]) => {
							const prompt = buildCompactionPrompt(msgs);
							const response = await runtime.provider.chat({
								messages: [{ role: "user", content: prompt }],
								model: runtime.model,
								temperature: 0.3,
								max_tokens: 2000,
							});
							return response.content || "Summary unavailable";
						},
						10,
					);
					if (compactResult.success) {
						console.log(
							`[session-graph] compacted target from ${compactResult.originalMessages} to ${compactResult.remainingMessages} messages`,
						);
					}
				}

				const mergedContent = buildCrossChannelMessages(
					previousSession.messages,
					session.messages,
					previousKey,
					key,
				);
				session.messages.push({
					role: "system",
					content: `[CROSS-CHANNEL CONTEXT: CONFIRMED CONTINUATION]\nSource: ${previousKey}\n${mergedContent}\nInstruction: Treat this as prior conversation context the user is continuing. Use it normally.`,
					timestamp: new Date().toISOString(),
					_mergeMeta: {
						sourceChannel: previousChannel,
						sourceKey: previousKey,
						decision: "continue",
					},
				});

				runtime.sessions.graph.merge(
					previousKey,
					key,
					"compact",
					previousSession.messages.length,
				);
				runtime.sessions.graph.saveAll();
				console.log(`[session-graph] auto-merged ${previousKey} -> ${key}`);
				if (routerResult.confidence >= runtime.stickyMergeConfidence) {
					runtime.stickyBridge.activate(previousKey, key);
				}
			} else {
				console.log(`[session-graph] skipped merge: ${mergeCheck.reason}`);
			}
		} else if (routerResult.decision === "ambiguous") {
			const mergedContent = buildCrossChannelMessages(
				previousSession.messages,
				session.messages,
				previousKey,
				key,
			);
			session.messages.push({
				role: "system",
				content: `[CROSS-CHANNEL CONTEXT: CANDIDATE]\nSource: ${previousKey}\n${mergedContent}\nInstruction: This context may be unrelated. DO NOT use it unless the user explicitly indicates continuation. If unclear, ask: "Want me to continue from your ${previousChannel} conversation, or start fresh?"`,
				timestamp: new Date().toISOString(),
				_mergeMeta: {
					sourceChannel: previousChannel,
					sourceKey: previousKey,
					decision: "ambiguous",
				},
			});
			runtime.sessions.graph.link(previousKey, key);
			runtime.sessions.graph.saveAll();
			console.log(
				`[session-graph] ambiguous merge candidate ${previousKey} -> ${key}`,
			);
		} else {
			if (isExplicitCrossChannelRequest(msg.content, previousChannel)) {
				const mergedContent = buildCrossChannelMessages(
					previousSession.messages,
					session.messages,
					previousKey,
					key,
				);
				session.messages.push({
					role: "system",
					content: `[CROSS-CHANNEL CONTEXT: USER-REQUESTED]\nSource: ${previousKey}\n${mergedContent}\nInstruction: User referenced cross-channel context explicitly. Prefer this context unless user asks to reset topic.`,
					timestamp: new Date().toISOString(),
					_mergeMeta: {
						sourceChannel: previousChannel,
						sourceKey: previousKey,
						decision: "continue",
					},
				});
				runtime.sessions.graph.merge(
					previousKey,
					key,
					"compact",
					previousSession.messages.length,
				);
				runtime.sessions.graph.saveAll();
				runtime.stickyBridge.activate(previousKey, key);
				console.log(
					`[session-graph] promoted separate->continue due to explicit cross-channel request ${previousKey} -> ${key}`,
				);
			}
			session.metadata.pendingMerge = {
				sourceKey: previousKey,
				sourceChannel: previousChannel,
				timestamp: Date.now(),
			};
			runtime.sessions.save(session);
			console.log(
				`[session-graph] separate topic, stored pending merge from ${previousKey}`,
			);
		}
	}

	runtime.sessions.graph.recordSwitch(previousChannel, msg.channel);
	runtime.sessions.graph.saveAll();

	return { previousChannel, previousChatId, platformChanged };
}
