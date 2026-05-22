import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageBus } from "@/base/base_agent/bus/queue";
import { DelegationController } from "@/base/base_agent/delegation/controller";
import { SubagentManager } from "@/base/base_agent/delegation/manager";
import { delegateTool } from "@/gateway/meta/tools/delegate_tool";
import {
	setAgentRegistry,
	setDelegationController,
	setSubagentManager,
} from "@/gateway/meta/tools/delegation_bridge";
import { GatewayAgentRegistry } from "@/gateway/registries/agents";
import { LLMProvider, type LLMResponse } from "@/providers/base";

class FinalProvider extends LLMProvider {
	async chat(): Promise<LLMResponse> {
		return {
			content: "delegated task result",
			tool_calls: [],
			finish_reason: "stop",
		};
	}

	getDefaultModel(): string {
		return "test/model";
	}
}

afterEach(() => {
	setSubagentManager(null);
});

describe("delegate gateway meta-tool", () => {
	test("spawns a background subagent and announces completion", async () => {
		const bus = new MessageBus();
		const manager = new SubagentManager({
			provider: new FinalProvider(),
			workspace: mkdtempSync(join(tmpdir(), "skyth-delegate-")),
			bus,
			restrict_to_workspace: true,
		});
		setSubagentManager(manager);
		setDelegationController(new DelegationController(2));
		setAgentRegistry(new GatewayAgentRegistry());

		const result = await delegateTool.handler({
			task: "Check something independently",
			label: "check",
		});

		expect(result).toMatchObject({
			delegated: true,
			caller: "generalist",
			mode: "subagent",
		});
		expect(String(result.message)).toContain("started");

		const announcement = await bus.consumeInboundWithTimeout(500);
		expect(announcement?.content).toContain("delegated task result");
		expect(announcement?.metadata?.status).toBe("ok");
	});
});
