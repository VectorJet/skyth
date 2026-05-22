import type { ToolCall, ToolResult } from "@/base/base_agent/runtime/types";

export type RunEvent =
	| {
			type: "run_start";
			threadId: string;
			runId: string;
			agentId: string;
		}
	| {
			type: "run_finish";
			threadId: string;
			runId: string;
			agentId: string;
			finishReason: string;
			output: string | null;
		}
	| { type: "step_start"; runId: string; stepIndex: number }
	| {
			type: "step_finish";
			runId: string;
			stepIndex: number;
			finishReason: string;
			usage?: Record<string, number>;
		}
	| { type: "model_delta"; runId: string; stepIndex: number; text: string }
	| { type: "reasoning_delta"; runId: string; stepIndex: number; text: string }
	| { type: "model_complete"; runId: string; stepIndex: number; text: string }
	| { type: "tool_call"; runId: string; stepIndex: number; call: ToolCall }
	| { type: "tool_result"; runId: string; stepIndex: number; result: ToolResult }
	| {
			type: "tool_error";
			runId: string;
			stepIndex: number;
			result: ToolResult;
		}
	| {
			type: "loop_detected";
			runId: string;
			stepIndex: number;
			signature: string;
		}
	| { type: "warning"; runId?: string; message: string };
