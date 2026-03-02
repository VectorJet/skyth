/**
 * Base Agent Types
 * 
 * Core type definitions for the modular agent runtime.
 */

import type { LLMProvider, StreamCallback } from "@/providers/base";
import type { MessageBus } from "@/bus/queue";
import type { SessionManager, Session } from "@/session/manager";
import type { MergeRouter } from "@/session/router";

/** Configuration for the agent runtime */
export interface AgentConfig {
  /** Message bus for publishing/subscribing messages */
  bus: MessageBus;
  /** LLM provider for chat completions */
  provider: LLMProvider;
  /** Workspace directory path */
  workspace: string;
  /** Model ID to use (defaults to provider's default) */
  model?: string;
  /** Maximum iterations per message (default: 200) */
  max_iterations?: number;
  /** Temperature for LLM calls (default: 0.7) */
  temperature?: number;
  /** Max tokens per response (default: 4096) */
  max_tokens?: number;
  /** Memory window for conversation history (default: 50) */
  memory_window?: number;
  /** Custom session manager */
  session_manager?: SessionManager;
  /** Shell command timeout in seconds (default: 60) */
  exec_timeout?: number;
  /** Restrict file operations to workspace only */
  restrict_to_workspace?: boolean;
  /** Cron service for scheduled tasks */
  cron_service?: any;
  /** Enable global tools access */
  enable_global_tools?: boolean;
  /** Model to use for merge routing decisions */
  router_model?: string;
  /** List of enabled channels */
  enabled_channels?: string[];
  /** Session graph configuration */
  session_graph_config?: SessionGraphConfig;
}

/** Session graph configuration */
export interface SessionGraphConfig {
  auto_merge_on_switch?: boolean;
  persist_to_disk?: boolean;
  max_switch_history?: number;
  router_model?: string;
  router_cache_ttl_ms?: number;
  router_cache_max_entries?: number;
  router_max_source_messages?: number;
  router_max_target_messages?: number;
  router_snippet_chars?: number;
  sticky_merge_switches?: number;
  sticky_merge_ttl_ms?: number;
  sticky_merge_confidence?: number;
  model_context_window?: number;
}

/** Agent runtime state */
export interface AgentState {
  /** Whether the agent is currently processing a message */
  processing: boolean;
  /** Current session key */
  sessionKey: string | null;
  /** Number of iterations in current loop */
  iterations: number;
  /** Tools used in current session */
  toolsUsed: string[];
  /** Whether consolidation is in progress */
  consolidating: boolean;
}

/** Inbound message from a channel */
export interface InboundMessage {
  channel: string;
  senderId: string;
  chatId: string;
  content: string;
  media?: string[];
  timestamp?: Date;
  metadata?: Record<string, any>;
}

/** Outbound message to a channel */
export interface OutboundMessage {
  channel: string;
  chatId: string;
  content: string;
  replyTo?: string;
  metadata?: Record<string, any>;
}

/** Context builder parameters */
export interface ContextParams {
  history: Array<Record<string, any>>;
  currentMessage: string;
  skillNames?: string[];
  media?: string[];
  channel: string;
  chat_id: string;
  toolNames?: string[];
  userLocation?: string;
  sessionPrimer?: string;
  platformChanged?: boolean;
  previousChannel?: string;
  previousChatId?: string;
  enabledChannels?: string[];
  channelTargets?: Map<string, { channel: string; chatId: string }>;
}

/** Delegation/subagent spawn parameters */
export interface DelegationParams {
  task: string;
  label?: string;
  originChannel: string;
  originChatId: string;
}

/** Result from agent loop execution */
export interface LoopResult {
  content: string | null;
  toolsUsed: string[];
  reasoning: string | null;
}

/** Tool execution result */
export interface ToolResult {
  output: string;
  metadata: Record<string, any>;
}

/** Memory consolidation options */
export interface ConsolidationOptions {
  archive_all: boolean;
  memory_window: number;
}

/** Onboarding state */
export interface OnboardingState {
  bootstrapPresent: boolean;
  identityComplete: boolean;
  userName: string | null;
  assistantName: string | null;
}