import { createInterface } from "node:readline";
import { AgentLoop } from "@/base/base_agent/runtime";
import { MessageBus } from "@/bus/queue";
import {
	boolFlag,
	makeProviderFromConfig,
	strFlag,
} from "@/cli/runtime_helpers";
import { loadConfig } from "@/config/loader";
import { loadModelsDevCatalog } from "@/providers/registry";
import type { CommandContext, CommandHandler } from "@/cli/runtime/types";

export const agentHandler: CommandHandler = async ({
	flags,
}: CommandContext): Promise<number> => {
	const message = strFlag(flags, "message") ?? strFlag(flags, "m");
	const session =
		strFlag(flags, "session") ?? strFlag(flags, "s") ?? "cli:direct";

	const cfg = loadConfig();
	await loadModelsDevCatalog();
	const model = strFlag(flags, "model") ?? cfg.agents.defaults.model;
	const routerModel =
		String(
			(cfg.session_graph as Record<string, unknown>)?.router_model ?? "",
		).trim() || (cfg.use_router ? String(cfg.router_model ?? "").trim() : "");
	const bus = new MessageBus();
	const provider = makeProviderFromConfig(model);
	const loop = new AgentLoop({
		bus,
		provider,
		workspace: cfg.workspace_path,
		model,
		temperature: cfg.agents.defaults.temperature,
		max_tokens: cfg.agents.defaults.max_tokens,
		max_iterations: cfg.agents.defaults.max_tool_iterations,
		steps: cfg.agents.defaults.steps,
		memory_window: cfg.agents.defaults.memory_window,
		exec_timeout: cfg.tools.exec.timeout,
		restrict_to_workspace: cfg.tools.restrict_to_workspace,
		router_model: routerModel || undefined,
		session_graph_config: cfg.session_graph,
	});

	const [channel, chatId] = session.includes(":")
		? session.split(":", 2)
		: ["cli", session];
	if (message) {
		const response = await loop.processMessage(
			{
				channel: channel!,
				senderId: "user",
				chatId: chatId!,
				content: message,
			},
			session,
		);
		if (response?.content) console.log(response.content);
		return 0;
	}

	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: true,
	});
	console.log("Interactive mode (type exit or quit to stop)");
	while (true) {
		const input = await new Promise<string>((resolve) =>
			rl.question("You: ", resolve),
		);
		const command = input.trim().toLowerCase();
		if (!command) continue;
		if (
			command === "exit" ||
			command === "quit" ||
			command === "/exit" ||
			command === "/quit" ||
			command === ":q"
		)
			break;
		const response = await loop.processMessage(
			{ channel: channel!, senderId: "user", chatId: chatId!, content: input },
			session,
		);
		if (response?.content) console.log(`skyth: ${response.content}`);
	}
	rl.close();
	return 0;
};
