import type { InboundMessage } from "@/bus/events";
import type { RuntimeContext } from "@/base/base_agent/runtime/types";

export interface AgentManifestLike {
  id: string;
  name: string;
  version: string;
  entrypoint: string;
  capabilities: string[];
  dependencies: string[];
  security: Record<string, unknown>;
  global_tools?: boolean;
  subagents?: string[];
}

export interface LifecycleHooks {
  onInit?: (runtime: RuntimeContext) => Promise<void>;
  onStart?: (runtime: RuntimeContext) => Promise<void>;
  onMessage?: (msg: InboundMessage, runtime: RuntimeContext) => Promise<void>;
  onToolCall?: (tool: string, args: Record<string, any>, runtime: RuntimeContext) => Promise<void>;
  onResponse?: (content: string, runtime: RuntimeContext) => Promise<void>;
  onStop?: (runtime: RuntimeContext) => Promise<void>;
  onDestroy?: (runtime: RuntimeContext) => Promise<void>;
}

export interface AgentDefinition {
  manifest: string | AgentManifestLike;
  context?: {
    identity?: boolean;
    tone?: boolean;
    platform?: boolean;
    bootstrapFiles?: string[];
  };
  memory?: {
    backend?: "sqlite";
    consolidationWindow?: number;
  };
  delegation?: {
    maxSubagents?: number;
    maxDepth?: number;
    circularPrevention?: boolean;
  };
  tools?: {
    autoDiscover?: boolean;
    globalAccess?: boolean;
  };
  hooks?: LifecycleHooks;
}

export type AgentCreateParams = ConstructorParameters<typeof import("@/base/base_agent/runtime").AgentLoop>[0];

export interface AgentFactory {
  definition: AgentDefinition;
  create(params: AgentCreateParams): import("@/base/base_agent/lifecycle").AgentLifecycle;
}

export interface ToolDefinition {
  name: string;
  author?: string;
  version?: string;
  description: string;
  requires?: { bins?: string[]; env?: string[] };
  parameters?: Record<string, any>;
  execute: (params: Record<string, any>, context?: any) => Promise<string>;
}

export interface PipelineDefinition {
  name: string;
  description?: string;
  steps: Array<{ tool: string; args?: Record<string, any> }>;
}
