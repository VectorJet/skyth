import { describe, expect, test } from "bun:test";
import {
	createChannelTurnRunner,
	type AgentTurnRunner,
	type WebBridgeRunner,
} from "@/gateway/channels/agent-runner";
import type { ChannelManager } from "@/gateway/channels/manager";
import type { AgentTurnInput } from "@/gateway/channels/queue";

function turn(originChannel = "web"): AgentTurnInput {
	return {
		text: "hello",
		userMessages: [
			{
				channel: originChannel,
				chatId: "chat-1",
				userId: "user-1",
				messageId: "message-1",
				text: "hello",
				ts: Date.now(),
				raw: {},
				isCommand: false,
			},
		],
		gatewayPrefaces: [],
		origin: { channel: originChannel, chatId: "chat-1" },
	};
}

function manager(sent: string[]): ChannelManager {
	return {
		send: async (_channel: string, _chatId: string, text: string) => {
			sent.push(text);
		},
	} as unknown as ChannelManager;
}

describe("createChannelTurnRunner", () => {
	test("uses hybrid agent runner as primary when web bridge is not preferred", async () => {
		const calls: string[] = [];
		const agentRunner: AgentTurnRunner = async (input) => {
			calls.push(input.text);
		};
		const web: WebBridgeRunner = {
			isConnected: () => true,
			pickTab: () => "tab-1",
			sendAndAwaitResponse: async () => {
				throw new Error("web should not be called");
			},
		};

		await createChannelTurnRunner(manager([]), {
			agentRunner,
			web,
			preferWebBridge: false,
		})(turn());

		expect(calls).toEqual(["hello"]);
	});

	test("uses web bridge first when configured and mirrors non-web replies", async () => {
		const sent: string[] = [];
		const web: WebBridgeRunner = {
			isConnected: () => true,
			pickTab: () => "tab-1",
			sendAndAwaitResponse: async () => "web reply",
		};

		await createChannelTurnRunner(manager(sent), {
			web,
			preferWebBridge: true,
		})(turn("slack"));

		expect(sent).toEqual(["web reply"]);
	});

	test("falls back to hybrid agent runner when preferred web bridge fails", async () => {
		const calls: string[] = [];
		const agentRunner: AgentTurnRunner = async (input) => {
			calls.push(input.text);
		};
		const web: WebBridgeRunner = {
			isConnected: () => true,
			pickTab: () => "tab-1",
			sendAndAwaitResponse: async () => {
				throw new Error("bridge unavailable");
			},
		};

		await createChannelTurnRunner(manager([]), {
			agentRunner,
			web,
			preferWebBridge: true,
		})(turn());

		expect(calls).toEqual(["hello"]);
	});
});
