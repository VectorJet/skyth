import { AgentLoop } from "@/agents/generalist_agent/loop";

export function createAgent(params: ConstructorParameters<typeof AgentLoop>[0]): AgentLoop {
  return new AgentLoop(params);
}
