import type {
	McpRunner,
	PipelineRunner,
	SkillRunner,
	ToolRunner,
} from "@/gateway/runners/index.ts";

export interface ExecuteToolRunners {
	tools: ToolRunner;
	pipelines: PipelineRunner;
	skills: SkillRunner;
	mcp: McpRunner;
}

export interface ToolRun {
	runId: string;
	toolName: string;
	status: "pending" | "running" | "completed" | "failed";
	input: Record<string, any>;
	output?: any;
	error?: string;
	startedAt: Date;
	completedAt?: Date;
	duration?: number;
	notifyOnComplete?: boolean;
	waitRequested?: boolean;
}
