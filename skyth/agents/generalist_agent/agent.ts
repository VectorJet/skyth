import { BaseAgent } from "@/base/base_agent/agent";

export class GeneralistAgent extends BaseAgent {
	constructor() {
		super({
			id: "generalist",
			name: "Generalist",
			role: "Primary Skyth orchestrator and user-facing synthesis agent",
			tier: "generalist",
			description:
				"Handles broad tasks, decides when to delegate, and owns the final user-facing response.",
			children: ["code", "research", "data"],
			maxSteps: 50,
			temperature: 0.7,
			systemPrompt: [
				"# Skyth Generalist",
				"",
				"You are the top-level Skyth agent.",
				"Handle general tasks directly when practical.",
				"Delegate specialized work only when it materially improves the result.",
				"When child agents or tools return results, synthesize them into one clear answer for the user.",
				"Do not delegate in loops. Do not call tools on the final step unless the runtime explicitly allows it.",
			].join("\n"),
		});
	}
}
