import type { InboundMessage, OutboundMessage } from "@/bus/events";
import type { AgentLoop } from "@/base/base_agent/runtime";

export type BaseAgentMessageIn = InboundMessage;
export type BaseAgentMessageOut = OutboundMessage;
export type BaseAgentRuntimeConfig = ConstructorParameters<typeof AgentLoop>[0];
