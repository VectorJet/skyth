import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageBus } from "@/base/base_agent/bus/queue";
import { DelegationController } from "@/base/base_agent/delegation/controller";
import { SubagentManager } from "@/base/base_agent/delegation/manager";
import { taskTool } from "@/gateway/meta/tools/task_tool";
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
			content: "inline task result",
			tool_calls: [],
			finish_reason: "stop",
		};
	}

	getDefaultModel(): string {
		return "test/model";
	}
}

function configureManager(): SubagentManager {
	const manager = new SubagentManager({
		provider: new FinalProvider(),
		workspace: mkdtempSync(join(tmpdir(), "skyth-task-")),
		bus: new MessageBus(),
		restrict_to_workspace: true,
	});
	setSubagentManager(manager);
	setDelegationController(new DelegationController(2));
	setAgentRegistry(new GatewayAgentRegistry());
	return manager;
}

afterEach(() => {
	setSubagentManager(null);
});

describe("task gateway meta-tool", () => {
	test("runs a subagent inline and returns its result", async () => {
		configureManager();

		const result = await taskTool.handler({
			task: "Summarize the workspace state",
			label: "summary",
		});

		expect(result).toMatchObject({
			mode: "task",
			label: "summary",
			result: "inline task result",
		});
		expect(typeof result.taskId).toBe("string");
	});
});
