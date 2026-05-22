export { AgentLoop } from "@/base/base_agent/runtime";
export { AgentLifecycle } from "@/base/base_agent/lifecycle";
export { ContextBuilder } from "@/base/base_agent/context/builder";
export {
	buildIdentityPrompt,
	extractMarkdownField,
} from "@/base/base_agent/context/identity";
export { buildPlatformOutputSection } from "@/base/base_agent/context/platform";
export { buildToneAdaptationSection } from "@/base/base_agent/context/tone";
export { MemoryStore } from "@/base/base_agent/memory/store";
export {
	scheduleConsolidation,
	waitForConsolidationLock,
	setConsolidationLock,
	clearConsolidationLock,
} from "@/base/base_agent/memory/consolidation";
export {
	buildMentalImageObservation,
	recordMentalImage,
} from "@/base/base_agent/memory/mental_image";
export { SubagentManager } from "@/base/base_agent/delegation/manager";
export { DelegationCallStack } from "@/base/base_agent/delegation/call_stack";
export type {
	DelegationRequest,
	TaskResult,
	CallStackEntry,
	DelegationNodeType,
	DelegationMode,
	DelegationCheckResult,
	DelegationRuleCode,
} from "@/base/base_agent/delegation/types";
export { SkillsLoader } from "@/base/base_agent/skills/loader";
export { BaseTool } from "@/base/tool";
export { ToolRegistry } from "@/base/base_agent/tools/registry";
export { completeBootstrapIfReady } from "@/base/base_agent/onboarding/bootstrap";
export {
	onboardingMissingFields,
	replyCoversOnboardingMissing,
} from "@/base/base_agent/onboarding/identity_check";
export { StickyBridgeController } from "@/base/base_agent/session/bridge";
export { SessionHandler } from "@/base/base_agent/session/handler";
export { runSwitchMerge } from "@/base/base_agent/session/merge";
export { processMessageWithRuntime } from "@/base/base_agent/runtime/message_processor";
export { runAgentLoop } from "@/base/base_agent/runtime/agent_loop_runner";
export { handleRuntimeCommand } from "@/base/base_agent/runtime/commands";
export { scheduleConsolidationIfNeeded } from "@/base/base_agent/runtime/memory_scheduler";
export { handlePlatformSwitchMerge } from "@/base/base_agent/session/switch_merge";
export type {
	RuntimeContext,
	ProcessContext,
	OutboundHandoff,
} from "@/base/base_agent/runtime/types";
export {
	stripThink,
	sanitizeOutput,
	shouldForceIdentityToolUse,
	shouldForceTaskPriority,
	isLikelyTaskDeferral,
	isIdentityFileWriteToolCall,
} from "@/base/base_agent/runtime/policies";
export {
	buildCrossChannelMessages,
	buildCompactionPrompt,
	consumePendingMergeIfRequested,
} from "@/base/base_agent/session/cross_channel";
export type { SkillEntry, SkillMeta } from "@/base/base_agent/skills/types";
export { parseToolMetadata } from "@/base/base_agent/tools/metadata";
export { loadToolEntries } from "@/base/base_agent/tools/loader";
export { FirstUseTracker } from "@/base/base_agent/tools/first_use";
export type { ToolMetadata, ToolEntry } from "@/base/base_agent/tools/types";

export * from "@/base/base_agent/types";

// ---- Hybrid loop scaffold additions ----
export type {
	AgentDefinition,
	AgentModelPreferences,
	AgentTier,
} from "@/base/base_agent/agent";
export { BaseAgent } from "@/base/base_agent/agent";
export { GeneralistAgent } from "@/agents/generalist_agent/agent";
export { AgentRunOrchestrator } from "@/base/base_agent/runtime/orchestrator";
export type { AgentRunOrchestratorOptions } from "@/base/base_agent/runtime/orchestrator";
export { StepRunner } from "@/base/base_agent/runtime/step-runner";
export type {
	AgentInput,
	RunOptions,
	StepResponse,
	StepRunEvent,
	StepRunnerInput,
	StepRunResult,
	ToolCall,
	ToolExecutionContext,
	ToolResult,
	ToolRuntime,
} from "@/base/base_agent/runtime/types";
export { DelegationController } from "@/base/base_agent/delegation/controller";
export type { DelegationFrame } from "@/base/base_agent/delegation/controller";
export { ToolExecutor } from "@/base/base_agent/tools/executor";
export type { ToolExecutorOptions } from "@/base/base_agent/tools/executor";
