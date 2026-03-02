import { AgentLoop } from "@/base/base_agent/runtime";

export function createAgent(params: ConstructorParameters<typeof AgentLoop>[0]): AgentLoop {
  return new AgentLoop(params);
}
